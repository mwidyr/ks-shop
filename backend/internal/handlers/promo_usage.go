package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Promotion Management > Usage History: every use of a promotion on an order, with the purpose, the staff who applied it
// and the customer's phone, plus a summary of what was issued and what was actually used. A cancelled order stays in
// the list (marked) but is not counted as used. The summary and the rows share one filter, so they always agree.

type usageRow struct {
	ID            int       `json:"id"`
	OrderedAt     time.Time `json:"ordered_at"`
	OrderID       int       `json:"order_id"`
	OrderNo       string    `json:"order_no"`
	SalesChannel  string    `json:"sales_channel"`
	OrderStatus   string    `json:"order_status"`
	PromotionID   int       `json:"promotion_id"`
	Promotion     string    `json:"promotion"`
	Code          string    `json:"code"`
	Type          string    `json:"type"`
	Amount        float64   `json:"amount"`
	Purpose       string    `json:"purpose"`
	AppliedBy     string    `json:"applied_by"`
	CustomerName  string    `json:"customer_name"`
	CustomerPhone string    `json:"customer_phone"`
	GMV           float64   `json:"gmv"`
	Cancelled     bool      `json:"cancelled"`
	Hosts         string    `json:"hosts"`
}

type usageSummary struct {
	Issued        float64 `json:"issued"`         // every record, cancelled orders included
	Used          float64 `json:"used"`           // discount actually used: cancelled orders left out
	Uses          int     `json:"uses"`           // number of uses (cancelled left out)
	CancelledUses int     `json:"cancelled_uses"` // records of cancelled orders, shown apart
	GMV           float64 `json:"gmv"`            // order GMV of the orders that used a promotion (each order once, cancelled left out)
}

const usageGMV = `(COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id), 0)
	- o.discount_amount - o.promotion_discount_amount + o.additional_amount + o.shipping_fee)`

const usageCancelled = `(pr.cancelled_at IS NOT NULL OR o.status = 'cancelled')`

const usageFrom = `
	FROM promotion_redemptions pr
	JOIN promotions p ON p.id = pr.promotion_id
	JOIN orders o ON o.id = pr.order_id
	JOIN customers c ON c.id = o.customer_id
	LEFT JOIN users u ON u.id = pr.applied_by`

// usageWhere builds the shared filter: period (order date, Asia/Jakarta days like Dashboard), Sales Channel, Location / Host,
// Promotion, Purpose and Staff.
func usageWhere(r *http.Request) (string, []interface{}) {
	from, to := resolveRange(r)
	args := []interface{}{from, to}
	where := " WHERE o.created_at >= $1 AND o.created_at < $2"
	q := r.URL.Query()
	add := func(cond string, v interface{}) {
		args = append(args, v)
		where += " AND " + strings.ReplaceAll(cond, "$$", "$"+strconv.Itoa(len(args)))
	}
	if ch := q.Get("sales_channel"); ch == "live" || ch == "website" {
		add("o.sales_channel = $$", ch)
	}
	if id, err := strconv.Atoi(q.Get("location_id")); err == nil && id > 0 {
		add("EXISTS (SELECT 1 FROM order_items oi JOIN hosts h ON h.id = oi.host_id WHERE oi.order_id = o.id AND h.location_id = $$)", id)
	}
	if id, err := strconv.Atoi(q.Get("host_id")); err == nil && id > 0 {
		add("EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.host_id = $$)", id)
	}
	if id, err := strconv.Atoi(q.Get("promotion_id")); err == nil && id > 0 {
		add("pr.promotion_id = $$", id)
	}
	if id, err := strconv.Atoi(q.Get("purpose_id")); err == nil && id > 0 {
		add("pr.purpose_id = $$", id)
	}
	if id, err := strconv.Atoi(q.Get("staff_id")); err == nil && id > 0 {
		add("pr.applied_by = $$", id)
	}
	return where, args
}

// Usage serves GET /promotions/usage (filters + page / page_size): the summary and one page of records.
func (h *PromotionHandler) Usage(w http.ResponseWriter, r *http.Request) {
	where, args := usageWhere(r)
	ctx := r.Context()

	var sum usageSummary
	var total int
	if err := h.DB.QueryRow(ctx, `
		WITH rows AS (
			SELECT pr.discount_applied AS amt, `+usageCancelled+` AS cancelled, o.id AS oid, `+usageGMV+` AS gmv`+usageFrom+where+`
		)
		SELECT COALESCE(SUM(amt), 0), COALESCE(SUM(amt) FILTER (WHERE NOT cancelled), 0),
		       COUNT(*) FILTER (WHERE NOT cancelled), COUNT(*) FILTER (WHERE cancelled), COUNT(*),
		       COALESCE((SELECT SUM(g.gmv) FROM (SELECT DISTINCT ON (oid) oid, gmv FROM rows WHERE NOT cancelled ORDER BY oid) g), 0)
		FROM rows`, args...).Scan(&sum.Issued, &sum.Used, &sum.Uses, &sum.CancelledUses, &total, &sum.GMV); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch usage summary")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if size < 1 || size > 200 {
		size = 50
	}
	limitArgs := append(append([]interface{}{}, args...), size, (page-1)*size)
	rows, err := h.DB.Query(ctx, `
		SELECT pr.id, o.created_at, o.id, o.order_no, o.sales_channel, o.status, p.id,
		       COALESCE(NULLIF(p.name, ''), p.code, ''), COALESCE(p.code, ''), p.type, pr.discount_applied,
		       COALESCE(pr.purpose_name, ''), COALESCE(u.name, ''), c.name, c.phone, `+usageGMV+`, `+usageCancelled+`,
		       COALESCE((SELECT string_agg(DISTINCT h.name, ', ') FROM order_items oi JOIN hosts h ON h.id = oi.host_id WHERE oi.order_id = o.id), '')`+
		usageFrom+where+`
		ORDER BY o.created_at DESC, pr.id DESC
		LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2), limitArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch usage history")
		return
	}
	defer rows.Close()
	list := []usageRow{}
	for rows.Next() {
		var x usageRow
		if rows.Scan(&x.ID, &x.OrderedAt, &x.OrderID, &x.OrderNo, &x.SalesChannel, &x.OrderStatus, &x.PromotionID, &x.Promotion, &x.Code, &x.Type,
			&x.Amount, &x.Purpose, &x.AppliedBy, &x.CustomerName, &x.CustomerPhone, &x.GMV, &x.Cancelled, &x.Hosts) == nil {
			list = append(list, x)
		}
	}
	// everyone who ever applied a promotion: the options of the Staff filter
	staff := []map[string]interface{}{}
	if srows, err := h.DB.Query(ctx, `SELECT DISTINCT u.id, u.name FROM promotion_redemptions pr JOIN users u ON u.id = pr.applied_by ORDER BY u.name`); err == nil {
		for srows.Next() {
			var id int
			var name string
			if srows.Scan(&id, &name) == nil {
				staff = append(staff, map[string]interface{}{"id": id, "name": name})
			}
		}
		srows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"summary": sum, "rows": list, "total": total, "page": page, "page_size": size, "staff": staff})
}
