package handlers

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReplenishmentHandler powers Replenishment Planning (Replenishment Planning PDF): a simple
// alert system on top of existing ERP data. Stock always means Available Stock including
// Incoming (Aktual + Incoming - Dipesan, see orderedByVariantSQL). Alerts are evaluated per
// colour/size (variant) but cards and lists count each product once per alert category. Sales
// use ALL channels with cancelled/returned orders excluded.
type ReplenishmentHandler struct {
	DB *pgxpool.Pool
}

type replenishmentVariant struct {
	VariantID        int      `json:"variant_id"`
	Color            string   `json:"color"`
	Size             string   `json:"size"`
	Available        int      `json:"available"`
	Sales7D          int      `json:"sales_7d"`
	Sales14D         int      `json:"sales_14d"`
	Sales30D         int      `json:"sales_30d"`
	SharePct         *float64 `json:"share_pct"`
	Coverage         *float64 `json:"coverage"`
	Alerts           []string `json:"alerts"`
	DaysWithoutSales *int     `json:"days_without_sales"`
	OverdueDays      int      `json:"overdue_days"`
}

type replenishmentProduct struct {
	ProductID    int                    `json:"product_id"`
	SKU          string                 `json:"sku"`
	Name         string                 `json:"name"`
	ImageURL     string                 `json:"image_url"`
	Category     string                 `json:"category"`
	SupplierID   *int                   `json:"supplier_id"`
	SupplierName string                 `json:"supplier_name"`
	Sales7D      int                    `json:"sales_7d"`
	Sales14D     int                    `json:"sales_14d"`
	Sales30D     int                    `json:"sales_30d"`
	Coverage     *float64               `json:"coverage"`
	Alerts       []string               `json:"alerts"`
	Variants     []replenishmentVariant `json:"variants"`

	// sort keys, not serialised
	maxNoSales int
	maxOverdue int
}

type replenishmentCards struct {
	Stockout int `json:"stockout"`
	Restock  int `json:"restock"`
	Stagnant int `json:"stagnant"`
	Overdue  int `json:"overdue"`
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

func loadReplenishmentSettings(ctx context.Context, db *pgxpool.Pool) replenishmentSettings {
	s := defaultReplenishmentSettings
	if err := db.QueryRow(ctx, `SELECT stockout_days, restock_days, stagnant_days FROM replenishment_settings WHERE id=1`).
		Scan(&s.StockoutDays, &s.RestockDays, &s.StagnantDays); err != nil || !s.valid() {
		return defaultReplenishmentSettings
	}
	return s
}

// GetSettings returns the global alert thresholds.
func (h *ReplenishmentHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"settings": loadReplenishmentSettings(r.Context(), h.DB),
		"defaults": defaultReplenishmentSettings,
	})
}

// UpdateSettings saves the thresholds. Body: {stockout_days, restock_days, stagnant_days}.
func (h *ReplenishmentHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var s replenishmentSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if s.StockoutDays < 1 || s.StagnantDays < 1 || s.RestockDays < 1 {
		respondError(w, http.StatusBadRequest, "thresholds must be at least 1 day")
		return
	}
	if !s.valid() {
		respondError(w, http.StatusBadRequest, "restock days must be greater than stockout days")
		return
	}
	if _, err := h.DB.Exec(r.Context(),
		`UPDATE replenishment_settings SET stockout_days=$1, restock_days=$2, stagnant_days=$3, updated_at=now() WHERE id=1`,
		s.StockoutDays, s.RestockDays, s.StagnantDays); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"settings": s, "defaults": defaultReplenishmentSettings})
}

// List returns the alert cards plus the product list. Query params: ?q= (SKU / product name /
// colour), ?supplier_id=, ?alert=all_alerts (default)|stockout|restock|stagnant|overdue|normal|all,
// ?sort=risk (default)|coverage|sales7|sales30.
func (h *ReplenishmentHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	settings := loadReplenishmentSettings(r.Context(), h.DB)

	where := " WHERE p.is_active = true AND p.deleted_at IS NULL"
	args := []interface{}{}
	if supplierID := q.Get("supplier_id"); supplierID != "" {
		if _, err := strconv.Atoi(supplierID); err == nil {
			args = append(args, supplierID)
			where += " AND p.supplier_id = $" + strconv.Itoa(len(args))
		}
	}

	rows, err := h.DB.Query(r.Context(), `
		WITH sales_agg AS (
			SELECT oi.variant_id,
			       SUM(CASE WHEN o.created_at >= now() - interval '7 days' THEN oi.qty ELSE 0 END) AS s7,
			       SUM(CASE WHEN o.created_at >= now() - interval '14 days' THEN oi.qty ELSE 0 END) AS s14,
			       SUM(CASE WHEN o.created_at >= now() - interval '30 days' THEN oi.qty ELSE 0 END) AS s30,
			       MAX(o.created_at) AS last_sale
			FROM order_items oi JOIN orders o ON o.id = oi.order_id
			WHERE o.status NOT IN ('cancelled','return')
			GROUP BY oi.variant_id
		), overdue AS (
			SELECT pi.variant_id,
			       (now() AT TIME ZONE 'Asia/Jakarta')::date - MIN(po.expected_arrival_date) AS days
			FROM purchase_items pi JOIN purchases po ON po.id = pi.purchase_id
			WHERE po.status IN ('ordered','pending_arrival','partially_received')
			  AND pi.qty > COALESCE(pi.received_qty, 0)
			  AND po.expected_arrival_date < (now() AT TIME ZONE 'Asia/Jakarta')::date
			GROUP BY pi.variant_id
		)
		SELECT p.id, COALESCE(p.sku,''), `+productNameSQL(r, "p")+`,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       COALESCE(p.category,''), p.supplier_id, COALESCE(s.name,'-'),
		       pv.id, COALESCE(pv.color,''), COALESCE(pv.size,''),
		       sb.available_stock + sb.incoming_stock - COALESCE(rv.qty,0),
		       COALESCE(sa.s7,0), COALESCE(sa.s14,0), COALESCE(sa.s30,0),
		       (now() AT TIME ZONE 'Asia/Jakarta')::date - (COALESCE(sa.last_sale, pv.created_at) AT TIME ZONE 'Asia/Jakarta')::date,
		       COALESCE(od.days, 0)
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN `+orderedByVariantSQL+` rv ON rv.variant_id = pv.id
		LEFT JOIN suppliers s ON s.id = p.supplier_id
		LEFT JOIN sales_agg sa ON sa.variant_id = pv.id
		LEFT JOIN overdue od ON od.variant_id = pv.id`+where+`
		ORDER BY p.id, pv.id`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch replenishment data")
		return
	}
	defer rows.Close()

	products := []*replenishmentProduct{}
	byID := map[int]*replenishmentProduct{}
	for rows.Next() {
		var p replenishmentProduct
		var v replenishmentVariant
		var noSales int
		if err := rows.Scan(&p.ProductID, &p.SKU, &p.Name, &p.ImageURL, &p.Category, &p.SupplierID, &p.SupplierName,
			&v.VariantID, &v.Color, &v.Size, &v.Available, &v.Sales7D, &v.Sales14D, &v.Sales30D, &noSales, &v.OverdueDays); err != nil {
			continue
		}
		v.DaysWithoutSales = &noSales
		cur := byID[p.ProductID]
		if cur == nil {
			cur = &p
			byID[p.ProductID] = cur
			products = append(products, cur)
		}
		cur.Variants = append(cur.Variants, v)
	}

	// Per-variant evaluation, product roll-ups and the (unfiltered) card counts.
	cards := replenishmentCards{}
	for _, p := range products {
		for i := range p.Variants {
			v := &p.Variants[i]
			p.Sales7D += v.Sales7D
			p.Sales14D += v.Sales14D
			p.Sales30D += v.Sales30D
		}
		seen := map[string]bool{}
		p.Alerts = []string{}
		for i := range p.Variants {
			v := &p.Variants[i]
			if p.Sales30D > 0 {
				share := round1(float64(v.Sales30D) / float64(p.Sales30D) * 100)
				v.SharePct = &share
			}
			v.Alerts = classifyVariant(settings, v.Available, v.Sales30D, v.DaysWithoutSales, v.OverdueDays)
			if c := stockCoverage(v.Available, v.Sales30D); c != nil {
				rc := round1(*c)
				v.Coverage = &rc
			}
			for _, a := range v.Alerts {
				seen[a] = true
			}
		}
		for a := range seen {
			p.Alerts = append(p.Alerts, a)
		}
		sortAlerts(p.Alerts)
		sort.SliceStable(p.Variants, func(i, j int) bool { return covLess(p.Variants[i].Coverage, p.Variants[j].Coverage) })
		cards.Stockout += b2i(seen[alertStockout])
		cards.Restock += b2i(seen[alertRestock])
		cards.Stagnant += b2i(seen[alertStagnant])
		cards.Overdue += b2i(seen[alertOverdue])
	}

	// Filtering: search + alert status (+ supplier, applied in SQL).
	alert := q.Get("alert")
	search := strings.ToLower(strings.TrimSpace(q.Get("q")))
	if alert == "" {
		alert = "all_alerts"
	}
	// Searching must also find products without alerts, so a search under the default
	// "All Alerts" falls back to every product.
	if search != "" && alert == "all_alerts" {
		alert = "all"
	}
	out := []*replenishmentProduct{}
	for _, p := range products {
		if search != "" && !productMatches(p, search) {
			continue
		}
		matching := matchingVariants(p, alert)
		if len(matching) == 0 {
			continue
		}
		// Product coverage = lowest valid coverage among the (matching) colours.
		p.Coverage = nil
		p.maxNoSales, p.maxOverdue = 0, 0
		for _, v := range matching {
			if v.Coverage != nil && (p.Coverage == nil || *v.Coverage < *p.Coverage) {
				c := *v.Coverage
				p.Coverage = &c
			}
			if v.DaysWithoutSales != nil && *v.DaysWithoutSales > p.maxNoSales {
				p.maxNoSales = *v.DaysWithoutSales
			}
			if v.OverdueDays > p.maxOverdue {
				p.maxOverdue = v.OverdueDays
			}
		}
		out = append(out, p)
	}
	sortReplenishmentProducts(out, alert, q.Get("sort"))

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"settings": settings,
		"cards":    cards,
		"products": out,
	})
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func productMatches(p *replenishmentProduct, search string) bool {
	if strings.Contains(strings.ToLower(p.SKU), search) || strings.Contains(strings.ToLower(p.Name), search) {
		return true
	}
	for _, v := range p.Variants {
		if strings.Contains(strings.ToLower(v.Color), search) {
			return true
		}
	}
	return false
}

// matchingVariants returns the colours that satisfy the alert filter. "all_alerts" = any alert,
// "normal" = no alert, "all" = every colour.
func matchingVariants(p *replenishmentProduct, alert string) []*replenishmentVariant {
	var out []*replenishmentVariant
	for i := range p.Variants {
		v := &p.Variants[i]
		ok := false
		switch alert {
		case "all":
			ok = true
		case "all_alerts":
			ok = len(v.Alerts) > 0
		case "normal":
			ok = len(v.Alerts) == 0
		default:
			ok = hasAlert(v.Alerts, alert)
		}
		if ok {
			out = append(out, v)
		}
	}
	return out
}

func sortReplenishmentProducts(list []*replenishmentProduct, alert, sortBy string) {
	sevRank := func(p *replenishmentProduct) int {
		if len(p.Alerts) == 0 {
			return 99
		}
		return alertSeverity[p.Alerts[0]]
	}
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i], list[j]
		switch sortBy {
		case "coverage":
			if covLess(a.Coverage, b.Coverage) != covLess(b.Coverage, a.Coverage) {
				return covLess(a.Coverage, b.Coverage)
			}
		case "sales7":
			if a.Sales7D != b.Sales7D {
				return a.Sales7D > b.Sales7D
			}
		case "sales30":
			if a.Sales30D != b.Sales30D {
				return a.Sales30D > b.Sales30D
			}
		default: // risk priority
			switch alert {
			case alertStagnant:
				if a.maxNoSales != b.maxNoSales {
					return a.maxNoSales > b.maxNoSales
				}
			case alertOverdue:
				if a.maxOverdue != b.maxOverdue {
					return a.maxOverdue > b.maxOverdue
				}
			default:
				if sa, sb := sevRank(a), sevRank(b); sa != sb {
					return sa < sb
				}
				if covLess(a.Coverage, b.Coverage) != covLess(b.Coverage, a.Coverage) {
					return covLess(a.Coverage, b.Coverage)
				}
			}
		}
		return a.SKU < b.SKU
	})
}
