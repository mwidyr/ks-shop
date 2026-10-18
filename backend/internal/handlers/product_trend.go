package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Product Trend Analysis (Product Trend Analysis PDF): compares the selected period with the
// previous equivalent period (same length, immediately before) for every product colour, and
// rolls that up to products and categories. Filters are the same as Product Sales Overview
// (channel / affiliate, location, host, date range). QTY and GMV are always both returned;
// metric / sort / q / page only decide ranking, filtering and paging, and all of that happens here
// (never in the browser).

type trendPeriod struct {
	Qty int     `json:"qty"`
	GMV float64 `json:"gmv"`
}

type trendEntry struct {
	Prev trendPeriod `json:"prev"`
	Cur  trendPeriod `json:"cur"`
}

type trendColor struct {
	Color string `json:"color"`
	trendEntry
}

type trendProduct struct {
	ProductID int          `json:"product_id"`
	SKU       string       `json:"sku"`
	Name      string       `json:"name"`
	Category  string       `json:"category"`
	Colors    []trendColor `json:"colors"`
	trendEntry
}

type trendCategory struct {
	Category string `json:"category"`
	trendEntry
}

func (e *trendEntry) add(o trendEntry) {
	e.Prev.Qty += o.Prev.Qty
	e.Prev.GMV += o.Prev.GMV
	e.Cur.Qty += o.Cur.Qty
	e.Cur.GMV += o.Cur.GMV
}

// ProductTrend returns the comparison data. Query: date_from/date_to (default last 30 days),
// channel, affiliate_id, location_id, host_id.
func (h *ReportsHandler) ProductTrend(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	span := to.Sub(from)
	prevFrom := from.Add(-span)
	q := r.URL.Query()

	where := " WHERE o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2 "
	args := []interface{}{prevFrom, to}
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND oi.host_id = $" + strconv.Itoa(len(args)+1) + " "
		args = append(args, hostID)
	}
	if locationID := q.Get("location_id"); locationID != "" {
		where += " AND h.location_id = $" + strconv.Itoa(len(args)+1) + " "
		args = append(args, locationID)
	}
	channelWhere, channelArgs := salesChannelWhere(r, "o", len(args)+1)
	where += channelWhere
	args = append(args, channelArgs...)
	// The boundary between the two periods is bound last so it can't shift the filter placeholders.
	args = append(args, from)
	fromArg := "$" + strconv.Itoa(len(args))

	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, COALESCE(p.sku,'-'), `+productNameSQL(r, "p")+`, COALESCE(p.category,'-'), COALESCE(pv.color,''),
		       COALESCE(SUM(CASE WHEN o.created_at <  `+fromArg+` THEN oi.qty ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN o.created_at <  `+fromArg+` THEN oi.qty*oi.price_at_order ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN o.created_at >= `+fromArg+` THEN oi.qty ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN o.created_at >= `+fromArg+` THEN oi.qty*oi.price_at_order ELSE 0 END),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN hosts h ON h.id = oi.host_id`+where+`
		GROUP BY p.id, p.sku, p.name, p.names, p.category, pv.color
		ORDER BY p.id, pv.color`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch product trend")
		return
	}
	defer rows.Close()

	var flat []trendRow
	for rows.Next() {
		var t trendRow
		if err := rows.Scan(&t.ProductID, &t.SKU, &t.Name, &t.Category, &t.Color, &t.Prev.Qty, &t.Prev.GMV, &t.Cur.Qty, &t.Cur.GMV); err != nil {
			continue
		}
		flat = append(flat, t)
	}

	metric := pickSort(q.Get("metric"), map[string]string{"qty": "qty", "gmv": "gmv"}, "qty")
	mode := pickSort(q.Get("sort"), map[string]string{"all": "all", "increase": "increase", "decrease": "decrease", "current": "current", "zero": "zero"}, "all")
	pg := parsePage(r, 20, 100)
	res := buildTrend(flat, metric, mode, q.Get("q"), h.colorNames(r), pg)

	day := "2006-01-02"
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"current":    map[string]string{"from": from.In(businessTZ).Format(day), "to": to.Add(-time.Second).In(businessTZ).Format(day)},
		"previous":   map[string]string{"from": prevFrom.In(businessTZ).Format(day), "to": from.Add(-time.Second).In(businessTZ).Format(day)},
		"growth":     res.Growth,
		"decline":    res.Decline,
		"categories": res.Categories,
		"products":   pageResponse(res.Products, res.Total, pg),
	})
}

// colorNames maps a stored colour value to every master name it can be shown as (zh + id), so the
// search matches what the UI displays. A failure just means search falls back to the raw colour.
func (h *ReportsHandler) colorNames(r *http.Request) map[string][]string {
	out := map[string][]string{}
	rows, err := h.DB.Query(r.Context(), `SELECT name_zh, name_id FROM colors`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var zh, id string
		if rows.Scan(&zh, &id) != nil {
			continue
		}
		names := []string{zh, id}
		out[zh] = names
		out[id] = names
	}
	return out
}

// trendRow is one product x colour line of the aggregate query.
type trendRow struct {
	ProductID                  int
	SKU, Name, Category, Color string
	trendEntry
}

type trendRankRow struct {
	Key       string `json:"key"`
	ProductID int    `json:"product_id"`
	SKU       string `json:"sku"`
	Color     string `json:"color"`
	trendEntry
}

type trendResult struct {
	Growth, Decline []trendRankRow
	Categories      []trendCategory
	Products        []*trendProduct
	Total           int
}

func trendValue(p trendPeriod, metric string) float64 {
	if metric == "gmv" {
		return p.GMV
	}
	return float64(p.Qty)
}

func (e trendEntry) diff(metric string) float64 {
	return trendValue(e.Cur, metric) - trendValue(e.Prev, metric)
}

func absF(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// buildTrend rolls colour rows up to products / categories and does every ordering, filtering and
// paging for the page. Ties always fall back to sku, product id and colour so pages are stable.
func buildTrend(rows []trendRow, metric, mode, search string, colorNames map[string][]string, pg pageParams) trendResult {
	products := []*trendProduct{}
	byProduct := map[int]*trendProduct{}
	byCategory := map[string]*trendCategory{}
	var colorRows []trendRankRow
	for _, t := range rows {
		p := byProduct[t.ProductID]
		if p == nil {
			p = &trendProduct{ProductID: t.ProductID, SKU: t.SKU, Name: t.Name, Category: t.Category, Colors: []trendColor{}}
			byProduct[t.ProductID] = p
			products = append(products, p)
		}
		p.Colors = append(p.Colors, trendColor{Color: t.Color, trendEntry: t.trendEntry})
		p.add(t.trendEntry)
		c := byCategory[t.Category]
		if c == nil {
			c = &trendCategory{Category: t.Category}
			byCategory[t.Category] = c
		}
		c.add(t.trendEntry)
		colorRows = append(colorRows, trendRankRow{Key: strconv.Itoa(t.ProductID) + "-" + t.Color, ProductID: t.ProductID, SKU: t.SKU, Color: t.Color, trendEntry: t.trendEntry})
	}

	var res trendResult

	// Top-10 colour rankings (ignore search / sort mode / paging).
	rank := func(keep func(float64) bool, less func(a, b float64) bool) []trendRankRow {
		var out []trendRankRow
		for _, r := range colorRows {
			if keep(r.diff(metric)) {
				out = append(out, r)
			}
		}
		sort.SliceStable(out, func(i, j int) bool {
			a, b := out[i].diff(metric), out[j].diff(metric)
			if a != b {
				return less(a, b)
			}
			if out[i].SKU != out[j].SKU {
				return out[i].SKU < out[j].SKU
			}
			if out[i].ProductID != out[j].ProductID {
				return out[i].ProductID < out[j].ProductID
			}
			return out[i].Color < out[j].Color
		})
		if len(out) > 10 {
			out = out[:10]
		}
		if out == nil {
			out = []trendRankRow{}
		}
		return out
	}
	res.Growth = rank(func(d float64) bool { return d > 0 }, func(a, b float64) bool { return a > b })
	res.Decline = rank(func(d float64) bool { return d < 0 }, func(a, b float64) bool { return a < b })

	res.Categories = make([]trendCategory, 0, len(byCategory))
	for _, c := range byCategory {
		res.Categories = append(res.Categories, *c)
	}
	sort.Slice(res.Categories, func(i, j int) bool {
		a, b := absF(res.Categories[i].diff(metric)), absF(res.Categories[j].diff(metric))
		if a != b {
			return a > b
		}
		return res.Categories[i].Category < res.Categories[j].Category
	})

	// Product table: search, filter, sort, page.
	s := strings.ToLower(strings.TrimSpace(search))
	matches := func(p *trendProduct) bool {
		if s == "" {
			return true
		}
		if strings.Contains(strings.ToLower(p.SKU), s) || strings.Contains(strings.ToLower(p.Name), s) {
			return true
		}
		for _, c := range p.Colors {
			if strings.Contains(strings.ToLower(c.Color), s) {
				return true
			}
			for _, n := range colorNames[c.Color] {
				if strings.Contains(strings.ToLower(n), s) {
					return true
				}
			}
		}
		return false
	}
	list := make([]*trendProduct, 0, len(products))
	for _, p := range products {
		if !matches(p) {
			continue
		}
		if mode == "zero" && !(trendValue(p.Prev, metric) > 0 && trendValue(p.Cur, metric) == 0) {
			continue
		}
		list = append(list, p)
	}
	key := func(p *trendProduct) float64 {
		switch mode {
		case "increase":
			return p.diff(metric)
		case "decrease":
			return -p.diff(metric)
		case "zero":
			return trendValue(p.Prev, metric)
		default: // all, current
			return trendValue(p.Cur, metric)
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		a, b := key(list[i]), key(list[j])
		if a != b {
			return a > b
		}
		if list[i].SKU != list[j].SKU {
			return list[i].SKU < list[j].SKU
		}
		return list[i].ProductID < list[j].ProductID
	})
	res.Total = len(list)
	lo := pg.Offset
	if lo > len(list) {
		lo = len(list)
	}
	hi := lo + pg.Size
	if hi > len(list) {
		hi = len(list)
	}
	res.Products = list[lo:hi]
	for _, p := range res.Products {
		sort.SliceStable(p.Colors, func(i, j int) bool {
			a, b := p.Colors[i].diff(metric), p.Colors[j].diff(metric)
			if a != b {
				return a > b
			}
			return p.Colors[i].Color < p.Colors[j].Color
		})
	}
	return res
}
