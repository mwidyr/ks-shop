package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"time"
)

// Product Trend Analysis (Product Trend Analysis PDF): compares the selected period with the
// previous equivalent period (same length, immediately before) for every product colour, and
// rolls that up to products and categories. Filters are the same as Product Sales Overview
// (channel / affiliate, location, host, date range). QTY and GMV are always both returned;
// the QTY/GMV toggle only changes ranking and Change % on the client.

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

	products := []*trendProduct{}
	byProduct := map[int]*trendProduct{}
	byCategory := map[string]*trendCategory{}
	for rows.Next() {
		var pid int
		var sku, name, category, color string
		var e trendEntry
		if err := rows.Scan(&pid, &sku, &name, &category, &color, &e.Prev.Qty, &e.Prev.GMV, &e.Cur.Qty, &e.Cur.GMV); err != nil {
			continue
		}
		p := byProduct[pid]
		if p == nil {
			p = &trendProduct{ProductID: pid, SKU: sku, Name: name, Category: category, Colors: []trendColor{}}
			byProduct[pid] = p
			products = append(products, p)
		}
		p.Colors = append(p.Colors, trendColor{Color: color, trendEntry: e})
		p.add(e)
		c := byCategory[category]
		if c == nil {
			c = &trendCategory{Category: category}
			byCategory[category] = c
		}
		c.add(e)
	}

	categories := make([]trendCategory, 0, len(byCategory))
	for _, c := range byCategory {
		categories = append(categories, *c)
	}
	sort.Slice(categories, func(i, j int) bool { return categories[i].Cur.GMV > categories[j].Cur.GMV })

	day := "2006-01-02"
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"current":    map[string]string{"from": from.In(businessTZ).Format(day), "to": to.Add(-time.Second).In(businessTZ).Format(day)},
		"previous":   map[string]string{"from": prevFrom.In(businessTZ).Format(day), "to": from.Add(-time.Second).In(businessTZ).Format(day)},
		"products":   products,
		"categories": categories,
	})
}
