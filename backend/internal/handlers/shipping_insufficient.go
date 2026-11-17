package handlers

import (
	"net/http"
	"sort"
	"strings"
	"time"

	appmw "ordermgmt/internal/middleware"
)

type insufficientLine struct {
	CreatedAt string `json:"created_at"` // Jakarta time, like the Order Management list
	OrderNo   string `json:"order_no"`   // merged shipments: every order number, comma separated
	Delivery  string `json:"delivery"`
	SKU       string `json:"sku"`
	Ordered   int    `json:"ordered"`   // quantity the order(s) need
	Available int    `json:"available"` // physical stock that could still be given to them
	Short     int    `json:"short"`     // ordered - available
}

// InsufficientStock serves GET /orders/insufficient-stock?date_from=&date_to= for the Excel export in Order
// Management: the orders the Shipping Workbench counts as "Insufficient stock" (same rule, same allocation of
// stock oldest order first), one line per missing SKU, optionally narrowed to a creation-date range
// (Jakarta calendar days, inclusive, like the order list).
func (h *ShippingWorkbenchHandler) InsufficientStock(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	win := dateWindow{from: q.Get("date_from"), to: q.Get("date_to")}
	for _, d := range []string{win.from, win.to} {
		if d != "" {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				respondError(w, http.StatusBadRequest, "invalid date")
				return
			}
		}
	}
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	claims := appmw.GetClaims(r)

	var picked []eligibleRow
	for _, p := range []string{"cvs_711", "cvs_familymart", "courier"} {
		res, err := computeEligible(r, h.DB, p, time.Now())
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load orders")
			return
		}
		for _, row := range res.Rows {
			if row.Category == catInsufficient && win.contains(row.earliestCreated) {
				picked = append(picked, row)
			}
		}
	}

	// A sales account only ever sees its own orders in Order Management, so it only gets its own shortages.
	if claims != nil && claims.Role == "sales" && len(picked) > 0 {
		var ids []int
		for _, row := range picked {
			ids = append(ids, row.OrderIDs...)
		}
		own := map[int]bool{}
		rows, err := h.DB.Query(r.Context(), `SELECT id FROM orders WHERE id = ANY($1) AND sales_id = $2`, ids, claims.UserID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load orders")
			return
		}
		for rows.Next() {
			var id int
			if rows.Scan(&id) == nil {
				own[id] = true
			}
		}
		rows.Close()
		kept := picked[:0]
		for _, row := range picked {
			all := true
			for _, id := range row.OrderIDs {
				all = all && own[id]
			}
			if all {
				kept = append(kept, row)
			}
		}
		picked = kept
	}

	sort.SliceStable(picked, func(i, j int) bool { return picked[i].earliestCreated.Before(picked[j].earliestCreated) })
	out := []insufficientLine{}
	for _, row := range picked {
		no := row.OrderNo
		if len(row.GroupOrderNos) > 1 {
			no = strings.Join(row.GroupOrderNos, ", ")
		}
		for _, s := range row.Shortages {
			out = append(out, insufficientLine{
				CreatedAt: row.earliestCreated.In(loc).Format("2006-01-02 15:04"),
				OrderNo:   no, Delivery: row.PickupChainName, SKU: s.SKU,
				Ordered: s.Need, Available: s.Have, Short: s.Need - s.Have,
			})
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"lines": out, "orders": len(picked)})
}
