package handlers

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

var allowedCustomerLabels = map[string]bool{
	"vip": true, "blacklist": true, "sering_retur": true, "pelanggan_baru": true,
}

type CustomerHandler struct {
	DB *pgxpool.Pool
}

type customerView struct {
	ID                  int     `json:"id"`
	Name                string  `json:"name"`
	Phone               string  `json:"phone"`
	Address             string  `json:"address"`
	LastPickupChainID   *int    `json:"last_pickup_chain_id"`
	LastPickupStoreName *string `json:"last_pickup_store_name"`
	LastPickupStoreCode *string `json:"last_pickup_store_code"`
	IsBlacklisted       bool    `json:"is_blacklisted"`
}

// customerSearchColumns is shared by both branches of Search below - joins each customer's
// most recent order to surface their last-used pickup method (chain/store), so a manual-order
// flow can auto-fill it when an existing customer is picked instead of asking again. Also
// surfaces blacklist status so CS can be warned before an order is even created, not just after.
const customerSearchColumns = `
	SELECT c.id, c.name, c.phone, COALESCE(c.address,''), lo.pickup_chain_id, lo.pickup_store_name, lo.pickup_store_code,
	       EXISTS(SELECT 1 FROM customer_labels cl WHERE cl.customer_id = c.id AND cl.label = 'blacklist')
	FROM customers c
	LEFT JOIN LATERAL (
		SELECT pickup_chain_id, pickup_store_name, pickup_store_code
		FROM orders WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1
	) lo ON true`

// Search finds customers by name or phone (used by Sales during checkout attribution).
func (h *CustomerHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	var rows interface {
		Next() bool
		Scan(...interface{}) error
		Close()
	}
	var err error
	if q == "" {
		res, e := h.DB.Query(r.Context(), customerSearchColumns+` ORDER BY c.name LIMIT 50`)
		rows, err = res, e
	} else {
		res, e := h.DB.Query(r.Context(), customerSearchColumns+`
			WHERE c.name ILIKE '%'||$1||'%' OR c.phone ILIKE '%'||$1||'%' ORDER BY c.name LIMIT 50`, q)
		rows, err = res, e
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to search customers")
		return
	}
	defer rows.Close()

	list := []customerView{}
	for rows.Next() {
		var c customerView
		rows.Scan(&c.ID, &c.Name, &c.Phone, &c.Address, &c.LastPickupChainID, &c.LastPickupStoreName, &c.LastPickupStoreCode, &c.IsBlacklisted)
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type createCustomerRequest struct {
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

func (h *CustomerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createCustomerRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" || req.Phone == "" {
		respondError(w, http.StatusBadRequest, "name and phone are required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING id`,
		req.Name, req.Phone, req.Address).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create customer")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// ---- Customer Management (Customer Management PDF) ---------------------------------------------
//
// One customer = one PHONE NUMBER: customers table rows that share a (digits-only) phone are merged
// into a single entry (staff-created and website-created records used to duplicate people). A
// VALID order is any order that is not cancelled / returned; spending is the goods revenue of valid
// orders (items - discounts + additional charges, shipping excluded) minus completed refunds
// against them. All KPI/list figures are derived here from ERP order records, never stored.

const vipThreshold = 3000.0 // NT$ cumulative valid spending that makes a customer VIP

type customerStats struct {
	ID          int        `json:"id"` // representative customer record (most recent order's customer)
	Name        string     `json:"name"`
	Phone       string     `json:"phone"`
	Address     string     `json:"address"`
	OrderCount  int        `json:"order_count"`
	TotalSpend  float64    `json:"total_spend"`
	LastOrderAt *time.Time `json:"last_order_at"`
	// AvgRepurchaseCycleDays is the average gap between this customer's purchase DAYS (several
	// orders on one day = one purchase event); null with fewer than two purchase days.
	AvgRepurchaseCycleDays *float64 `json:"avg_repurchase_cycle_days"`
	Tier                   string   `json:"tier"` // "regular" | "vip"
	Labels                 []string `json:"labels"`
	// LastDelivery is the latest known delivery destination: the most recent valid order that has
	// store/address info (older orders fill in when the latest one has none, e.g. unverified code).
	LastDelivery *customerDelivery  `json:"last_delivery"`
	LastOrder    *customerLastOrder `json:"last_order"`
}

type customerKPI struct {
	TotalCustomers     int      `json:"total_customers"`
	ReturningCustomers int      `json:"returning_customers"`
	RepeatPurchaseRate *float64 `json:"repeat_purchase_rate"`  // percent
	RepurchaseCycle    *float64 `json:"repurchase_cycle_days"` // median gap, days
	AOV                *float64 `json:"aov"`
	LTV                *float64 `json:"ltv"`
}

type customerStatsResponse struct {
	KPI       customerKPI     `json:"kpi"`
	Customers []customerStats `json:"customers"`
}

var nonDigits = regexp.MustCompile(`[^0-9]`)

func phoneKey(phone string, id int) string {
	if d := nonDigits.ReplaceAllString(phone, ""); d != "" {
		return d
	}
	return "id:" + strconv.Itoa(id)
}

// validOrderRevenueSQL is a lateral subquery giving each order's goods revenue and the completed
// refund amount against it (store credit counts as money returned; replacement does not).
const validOrderRevenueSQL = `
	JOIN LATERAL (
		SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount - o.promotion_discount_amount + o.additional_amount AS revenue
		FROM order_items oi WHERE oi.order_id = o.id
	) rev ON true
	LEFT JOIN LATERAL (
		SELECT COALESCE(SUM(r.amount),0) AS refunded FROM returns r
		WHERE r.order_id = o.id AND r.status = 'completed' AND r.refund_type IN ('full','store_credit')
	) rf ON true`

// Stats returns the KPI cards and every customer (merged by phone) with order count, spending,
// last purchase, average repurchase cycle and automatic tier, for the Customers page.
func (h *CustomerHandler) Stats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	custRows, err := h.DB.Query(ctx, `SELECT id, name, phone, COALESCE(address,'') FROM customers ORDER BY id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch customers")
		return
	}
	groups := map[string]*customerStats{}
	groupOf := map[int]string{}
	var order []string
	for custRows.Next() {
		var id int
		var name, phone, addr string
		if custRows.Scan(&id, &name, &phone, &addr) != nil {
			continue
		}
		key := phoneKey(phone, id)
		groupOf[id] = key
		if g, ok := groups[key]; ok {
			g.ID, g.Name, g.Address = id, name, addr // later record wins until an order picks the representative
			continue
		}
		groups[key] = &customerStats{ID: id, Name: name, Phone: phone, Address: addr, Labels: []string{}, Tier: "regular"}
		order = append(order, key)
	}
	custRows.Close()

	orderRows, err := h.DB.Query(ctx, `
		SELECT o.id, o.customer_id, o.created_at, rev.revenue, rf.refunded
		FROM orders o`+validOrderRevenueSQL+`
		WHERE o.status NOT IN ('cancelled','return')
		ORDER BY o.created_at`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch customer orders")
		return
	}
	type agg struct {
		days    map[string]time.Time // Jakarta calendar day -> that day (midnight)
		lastRep int
	}
	aggs := map[string]*agg{}
	var totalRevenue float64
	totalOrders := 0
	for orderRows.Next() {
		var oid, cid int
		var at time.Time
		var rev, refunded float64
		if orderRows.Scan(&oid, &cid, &at, &rev, &refunded) != nil {
			continue
		}
		key, ok := groupOf[cid]
		if !ok {
			continue
		}
		net := rev - refunded
		if net < 0 {
			net = 0
		}
		g := groups[key]
		g.OrderCount++
		g.TotalSpend += net
		a := aggs[key]
		if a == nil {
			a = &agg{days: map[string]time.Time{}}
			aggs[key] = a
		}
		local := at.In(businessTZ)
		day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
		a.days[day.Format("2006-01-02")] = day
		if g.LastOrderAt == nil || at.After(*g.LastOrderAt) {
			t := at
			g.LastOrderAt = &t
			g.ID = cid // the customer record of the most recent order represents the person
		}
		totalRevenue += net
		totalOrders++
	}
	orderRows.Close()

	// Name / phone / address come from the representative record (the most recent order's customer).
	repName := map[int]struct{ name, phone, addr string }{}
	if rr, err := h.DB.Query(ctx, `SELECT id, name, phone, COALESCE(address,'') FROM customers`); err == nil {
		for rr.Next() {
			var id int
			var n, p, a string
			if rr.Scan(&id, &n, &p, &a) == nil {
				repName[id] = struct{ name, phone, addr string }{n, p, a}
			}
		}
		rr.Close()
	}

	kpi := customerKPI{}
	var gaps []float64
	for _, key := range order {
		g := groups[key]
		if rn, ok := repName[g.ID]; ok {
			g.Name, g.Phone, g.Address = rn.name, rn.phone, rn.addr
		}
		if g.TotalSpend >= vipThreshold {
			g.Tier = "vip"
		}
		if g.OrderCount > 0 {
			kpi.TotalCustomers++
		}
		a := aggs[key]
		if a == nil || len(a.days) < 2 {
			continue
		}
		kpi.ReturningCustomers++
		days := make([]time.Time, 0, len(a.days))
		for _, d := range a.days {
			days = append(days, d)
		}
		sort.Slice(days, func(i, j int) bool { return days[i].Before(days[j]) })
		var sum float64
		for i := 1; i < len(days); i++ {
			gap := days[i].Sub(days[i-1]).Hours() / 24
			gaps = append(gaps, gap)
			sum += gap
		}
		avg := sum / float64(len(days)-1)
		g.AvgRepurchaseCycleDays = &avg
	}
	if kpi.TotalCustomers > 0 {
		rate := float64(kpi.ReturningCustomers) / float64(kpi.TotalCustomers) * 100
		kpi.RepeatPurchaseRate = &rate
		ltv := totalRevenue / float64(kpi.TotalCustomers)
		kpi.LTV = &ltv
	}
	if totalOrders > 0 {
		aov := totalRevenue / float64(totalOrders)
		kpi.AOV = &aov
	}
	if len(gaps) > 0 {
		sort.Float64s(gaps)
		m := gaps[len(gaps)/2]
		if len(gaps)%2 == 0 {
			m = (gaps[len(gaps)/2-1] + gaps[len(gaps)/2]) / 2
		}
		kpi.RepurchaseCycle = &m
	}

	if labelRows, err := h.DB.Query(ctx, `SELECT customer_id, label FROM customer_labels`); err == nil {
		seen := map[string]map[string]bool{}
		for labelRows.Next() {
			var customerID int
			var label string
			if labelRows.Scan(&customerID, &label) != nil {
				continue
			}
			key, ok := groupOf[customerID]
			if !ok || label == "vip" { // the old manual VIP label is superseded by the automatic tier
				continue
			}
			if seen[key] == nil {
				seen[key] = map[string]bool{}
			}
			if !seen[key][label] {
				seen[key][label] = true
				groups[key].Labels = append(groups[key].Labels, label)
			}
		}
		labelRows.Close()
	}

	// Latest order + latest known delivery destination per person (newest valid order first).
	withCode := map[string]*customerDelivery{} // person|chain|store name -> newest order of that store that has a code
	if dRows, err := h.DB.Query(ctx, `
		SELECT o.customer_id, o.order_no, o.status, o.created_at,
		       COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id),0)
		         - o.discount_amount - o.promotion_discount_amount + o.additional_amount +
		       CASE WHEN EXISTS (
		           SELECT 1 FROM order_shipment_group_members gm
		           JOIN order_shipment_groups sg ON sg.id = gm.group_id
		           WHERE gm.order_id = o.id AND sg.shipping_fee_order_id != o.id
		       ) THEN 0 ELSE o.shipping_fee END,
		       COALESCE((SELECT string_agg(p.sku || COALESCE(' ' || NULLIF(pv.color,''),'') || ' x' || oi.qty, ', ' ORDER BY oi.id)
		                 FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id
		                 JOIN products p ON p.id = pv.product_id WHERE oi.order_id = o.id),''),
		       COALESCE(pc.name,''), COALESCE(pc.chain_type,''),
		       COALESCE(cs.store_name, o.pickup_store_name, ''), COALESCE(o.pickup_store_code,''),
		       CASE WHEN pc.chain_type = 'courier' THEN COALESCE(o.shipping_address,'') ELSE COALESCE(cs.store_addr,'') END,
		       cs.store_code IS NOT NULL
		FROM orders o
		LEFT JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN cvs_stores cs ON cs.chain_type = pc.chain_type AND cs.store_code = o.pickup_store_code
		WHERE o.status NOT IN ('cancelled','return')
		ORDER BY o.created_at DESC, o.id DESC`); err == nil {
		for dRows.Next() {
			var cid int
			var at time.Time
			var lo customerLastOrder
			var d customerDelivery
			if dRows.Scan(&cid, &lo.OrderNo, &lo.Status, &at, &lo.Total, &lo.Items,
				&d.ChainName, &d.ChainType, &d.StoreName, &d.StoreCode, &d.Address, &d.StoreVerified) != nil {
				continue
			}
			key, ok := groupOf[cid]
			if !ok {
				continue
			}
			g := groups[key]
			if g.LastOrder == nil {
				lo.CreatedAt = at.Format(time.RFC3339)
				lo.ChainName, lo.StoreName, lo.StoreCode, lo.Address = d.ChainName, d.StoreName, d.StoreCode, d.Address
				g.LastOrder = &lo
			}
			if d.StoreCode != "" && d.StoreName != "" {
				if _, seen := withCode[key+"|"+d.ChainName+"|"+d.StoreName]; !seen {
					dc := d
					withCode[key+"|"+d.ChainName+"|"+d.StoreName] = &dc
				}
			}
			if g.LastDelivery == nil && (d.StoreName != "" || d.StoreCode != "" || d.Address != "") {
				dd := d
				g.LastDelivery = &dd
			}
		}
		dRows.Close()
		for key, g := range groups {
			d := g.LastDelivery
			if d == nil {
				continue
			}
			// Latest order typed the store name without a code: reuse the code (and verified store
			// details) from an earlier order of the same store.
			if d.StoreCode == "" && d.StoreName != "" {
				if prev := withCode[key+"|"+d.ChainName+"|"+d.StoreName]; prev != nil {
					d.StoreCode, d.Address, d.StoreVerified = prev.StoreCode, prev.Address, prev.StoreVerified
				}
			}
			d.City, d.District = taiwanCityFromAddress(d.Address)
		}
	}

	list := make([]customerStats, 0, len(order))
	for _, key := range order {
		list = append(list, *groups[key])
	}
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i].LastOrderAt, list[j].LastOrderAt
		switch {
		case a == nil && b == nil:
			return list[i].Name < list[j].Name
		case a == nil:
			return false
		case b == nil:
			return true
		}
		return a.After(*b)
	})
	respondJSON(w, http.StatusOK, customerStatsResponse{KPI: kpi, Customers: list})
}

// phoneGroupIDs returns every customers.id sharing the given customer's phone number, so label and
// delete actions apply to the merged person rather than only one duplicate record.
func (h *CustomerHandler) phoneGroupIDs(ctx context.Context, id int) []int {
	var phone string
	if err := h.DB.QueryRow(ctx, `SELECT phone FROM customers WHERE id=$1`, id).Scan(&phone); err != nil {
		return nil
	}
	digits := nonDigits.ReplaceAllString(phone, "")
	if digits == "" {
		return []int{id}
	}
	ids := []int{}
	rows, err := h.DB.Query(ctx, `SELECT id FROM customers WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1`, digits)
	if err != nil {
		return []int{id}
	}
	defer rows.Close()
	for rows.Next() {
		var x int
		if rows.Scan(&x) == nil {
			ids = append(ids, x)
		}
	}
	if len(ids) == 0 {
		return []int{id}
	}
	return ids
}

type deliveryEntry struct {
	ChainName  string `json:"chain_name"`
	ChainType  string `json:"chain_type"`
	StoreName  string `json:"store_name"`
	StoreCode  string `json:"store_code"`
	Address    string `json:"address"`
	Verified   bool   `json:"store_verified"`
	LastUsedAt string `json:"last_used_at"`
	TimesUsed  int    `json:"times_used"`
}

type customerOrderEntry struct {
	ID        int     `json:"id"`
	OrderNo   string  `json:"order_no"`
	Status    string  `json:"status"`
	Total     float64 `json:"total"`
	CreatedAt string  `json:"created_at"`
}

type hostHistoryEntry struct {
	Host   string `json:"host"`
	Orders int    `json:"orders"`
}

// Detail returns the extra Customer Detail sections: delivery history (latest first, each
// store/address once) and host purchase history (orders per host, Website as a virtual host).
func (h *CustomerHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	ctx := r.Context()
	ids := h.phoneGroupIDs(ctx, id)
	if ids == nil {
		respondError(w, http.StatusNotFound, "customer not found")
		return
	}

	delivery := []deliveryEntry{}
	if rows, err := h.DB.Query(ctx, `
		SELECT pc.name, pc.chain_type, COALESCE(cs.store_name, o.pickup_store_name, ''), COALESCE(o.pickup_store_code,''),
		       CASE WHEN pc.chain_type = 'courier' THEN COALESCE(o.shipping_address,'') ELSE COALESCE(cs.store_addr,'') END,
		       cs.store_code IS NOT NULL, MAX(o.created_at), COUNT(*)
		FROM orders o JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN cvs_stores cs ON cs.chain_type = pc.chain_type AND cs.store_code = o.pickup_store_code
		WHERE o.customer_id = ANY($1) AND o.status <> 'cancelled'
		GROUP BY pc.name, pc.chain_type, COALESCE(cs.store_name, o.pickup_store_name, ''), COALESCE(o.pickup_store_code,''),
		         CASE WHEN pc.chain_type = 'courier' THEN COALESCE(o.shipping_address,'') ELSE COALESCE(cs.store_addr,'') END,
		         cs.store_code IS NOT NULL
		ORDER BY MAX(o.created_at) DESC`, ids); err == nil {
		lastAt := map[int]time.Time{}
		for rows.Next() {
			var d deliveryEntry
			var last time.Time
			if rows.Scan(&d.ChainName, &d.ChainType, &d.StoreName, &d.StoreCode, &d.Address, &d.Verified, &last, &d.TimesUsed) != nil {
				continue
			}
			// Same store typed once with a code and once without = one entry (keep the code).
			merged := false
			if d.ChainType != "courier" {
				for i := range delivery {
					e := &delivery[i]
					if e.ChainName == d.ChainName && e.StoreName == d.StoreName && e.StoreName != "" && (e.StoreCode == "" || d.StoreCode == "") {
						if e.StoreCode == "" {
							e.StoreCode, e.Address, e.Verified = d.StoreCode, d.Address, d.Verified
						}
						e.TimesUsed += d.TimesUsed
						if last.After(lastAt[i]) {
							lastAt[i] = last
						}
						merged = true
						break
					}
				}
			}
			if !merged {
				lastAt[len(delivery)] = last
				delivery = append(delivery, d)
			}
		}
		rows.Close()
		for i := range delivery {
			delivery[i].LastUsedAt = lastAt[i].Format(time.RFC3339)
		}
		sort.SliceStable(delivery, func(a, b int) bool { return delivery[a].LastUsedAt > delivery[b].LastUsedAt })
	}

	hosts := []hostHistoryEntry{}
	if rows, err := h.DB.Query(ctx, `
		SELECT name, COUNT(DISTINCT order_id) AS n FROM (
			SELECT oi.order_id, h.name FROM order_items oi
			JOIN orders o ON o.id = oi.order_id JOIN hosts h ON h.id = oi.host_id
			WHERE o.customer_id = ANY($1) AND o.status NOT IN ('cancelled','return')
			UNION
			SELECT o.id, 'Website' FROM orders o
			WHERE o.customer_id = ANY($1) AND o.status NOT IN ('cancelled','return') AND o.sales_channel = 'website'
		) x GROUP BY name ORDER BY n DESC, name`, ids); err == nil {
		for rows.Next() {
			var e hostHistoryEntry
			if rows.Scan(&e.Host, &e.Orders) == nil {
				hosts = append(hosts, e)
			}
		}
		rows.Close()
	}

	// Order history across every record of this person (a plain search by phone missed orders
	// kept under the same number written differently, e.g. "0900-111-222" vs "0900111222"). Total
	// uses the same figure as Order Management (goods - discounts + additional + shipping, with the
	// shipping fee charged once for a merged shipment).
	orders := []customerOrderEntry{}
	if rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.order_no, o.status, o.created_at,
		       COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id),0)
		         - o.discount_amount - o.promotion_discount_amount + o.additional_amount +
		       CASE WHEN EXISTS (
		           SELECT 1 FROM order_shipment_group_members gm
		           JOIN order_shipment_groups g ON g.id = gm.group_id
		           WHERE gm.order_id = o.id AND g.shipping_fee_order_id != o.id
		       ) THEN 0 ELSE o.shipping_fee END
		FROM orders o WHERE o.customer_id = ANY($1)
		ORDER BY o.created_at DESC LIMIT 50`, ids); err == nil {
		for rows.Next() {
			var e customerOrderEntry
			var at time.Time
			if rows.Scan(&e.ID, &e.OrderNo, &e.Status, &at, &e.Total) == nil {
				e.CreatedAt = at.Format(time.RFC3339)
				orders = append(orders, e)
			}
		}
		rows.Close()
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"delivery_history": delivery, "host_history": hosts, "orders": orders})
}

type setLabelRequest struct {
	Label   string `json:"label"`
	Enabled bool   `json:"enabled"`
}

// SetLabel toggles one manual CRM label (vip/blacklist/sering_retur/pelanggan_baru) on a
// customer - independent of the computed segment above, this is a staff action.
func (h *CustomerHandler) SetLabel(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	var req setLabelRequest
	if err := decodeJSON(r, &req); err != nil || !allowedCustomerLabels[req.Label] {
		respondError(w, http.StatusBadRequest, "invalid label")
		return
	}
	action := "label_added"
	ids := h.phoneGroupIDs(r.Context(), customerID)
	if ids == nil {
		respondError(w, http.StatusNotFound, "customer not found")
		return
	}
	if req.Enabled {
		for _, cid := range ids {
			if _, err := h.DB.Exec(r.Context(), `
				INSERT INTO customer_labels (customer_id, label) VALUES ($1,$2)
				ON CONFLICT (customer_id, label) DO NOTHING`, cid, req.Label); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to set label")
				return
			}
		}
	} else {
		action = "label_removed"
		if _, err := h.DB.Exec(r.Context(), `
			DELETE FROM customer_labels WHERE customer_id = ANY($1) AND label=$2`, ids, req.Label); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to remove label")
			return
		}
	}
	claims := appmw.GetClaims(r)
	var userID *int
	if claims != nil {
		userID = &claims.UserID
	}
	logActivity(r.Context(), h.DB, "customer", customerID, action, userID, fmt.Sprintf("label: %s", req.Label))
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete removes a customer permanently. Blocked with 409 if they have order history, since
// order_items has no cascade delete from customers.
func (h *CustomerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	// The "customer" on screen is every record sharing this phone number - delete them together
	// (any one with order history blocks the whole delete, via the foreign key).
	ids := h.phoneGroupIDs(r.Context(), id)
	if ids == nil {
		ids = []int{id}
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM customers WHERE id = ANY($1)`, ids)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "pelanggan pernah memiliki order; tidak bisa dihapus")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete customer")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
