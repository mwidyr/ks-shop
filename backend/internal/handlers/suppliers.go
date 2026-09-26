package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// SupplierHandler manages the Supplier Profile (item: Supplier & Purchase Management additional
// requirements): centralized supplier info, purchase rules (supplier-level defaults; see
// product_purchase_rules for product-level overrides), and repeatable Contacts/Notes/Price
// References sub-resources.
type SupplierHandler struct {
	DB *pgxpool.Pool
}

var validSupplierStatuses = map[string]bool{"active": true, "paused": true, "inactive": true}

type supplierView struct {
	ID                  int      `json:"id"`
	Name                string   `json:"name"`
	Status              string   `json:"status"`
	Source              string   `json:"source"`
	Category            string   `json:"category"`
	Customizable        bool     `json:"customizable"`
	ContactName         string   `json:"contact_name"`
	Phone               string   `json:"phone"`
	Address             string   `json:"address"`
	PaymentMethod       string   `json:"payment_method"`
	DefaultLeadTimeDays *int     `json:"default_lead_time_days"`
	MinOrderQty         *int     `json:"min_order_qty"`
	MinColorQty         *int     `json:"min_color_qty"`
	MinOrderAmount      *float64 `json:"min_order_amount"`
	OrderMultiple       *int     `json:"order_multiple"`
	MixedColorAllowed   bool     `json:"mixed_color_allowed"`
	PackSetQty          *int     `json:"pack_set_qty"`
}

const supplierSelect = `
	SELECT id, name, status, COALESCE(source,''), COALESCE(category,''), customizable,
	       COALESCE(contact_name,''), COALESCE(phone,''), COALESCE(address,''), COALESCE(payment_method,''),
	       default_lead_time_days, min_order_qty, min_color_qty, min_order_amount, order_multiple,
	       mixed_color_allowed, pack_set_qty
	FROM suppliers`

func scanSupplier(row interface{ Scan(...interface{}) error }) (supplierView, error) {
	var s supplierView
	err := row.Scan(&s.ID, &s.Name, &s.Status, &s.Source, &s.Category, &s.Customizable,
		&s.ContactName, &s.Phone, &s.Address, &s.PaymentMethod,
		&s.DefaultLeadTimeDays, &s.MinOrderQty, &s.MinColorQty, &s.MinOrderAmount, &s.OrderMultiple,
		&s.MixedColorAllowed, &s.PackSetQty)
	return s, err
}

// List returns active+paused suppliers by default; pass ?include_inactive=true to also see
// inactive ones (e.g. for the Supplier Profile management page).
func (h *SupplierHandler) List(w http.ResponseWriter, r *http.Request) {
	query := supplierSelect
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE status <> 'inactive'`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch suppliers")
		return
	}
	defer rows.Close()

	list := []supplierView{}
	for rows.Next() {
		s, err := scanSupplier(rows)
		if err != nil {
			continue
		}
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type supplierContactView struct {
	ID          int    `json:"id"`
	ContactName string `json:"contact_name"`
	Method      string `json:"method"`
	Value       string `json:"value"`
}

type supplierNoteView struct {
	ID        int    `json:"id"`
	Note      string `json:"note"`
	CreatedBy string `json:"created_by"`
	CreatedAt string `json:"created_at"`
}

type supplierPriceRefView struct {
	ID       int      `json:"id"`
	Category string   `json:"category"`
	PriceMin *float64 `json:"price_min"`
	PriceMax *float64 `json:"price_max"`
}

type supplierDetailView struct {
	supplierView
	Contacts        []supplierContactView  `json:"contacts"`
	Notes           []supplierNoteView     `json:"notes"`
	PriceReferences []supplierPriceRefView `json:"price_references"`
}

// Detail returns one supplier's full profile: core fields plus its Contacts/Notes/Price
// References sub-resources, all in one call.
func (h *SupplierHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	row := h.DB.QueryRow(r.Context(), supplierSelect+" WHERE id=$1", id)
	base, err := scanSupplier(row)
	if err != nil {
		respondError(w, http.StatusNotFound, "supplier not found")
		return
	}
	detail := supplierDetailView{supplierView: base, Contacts: []supplierContactView{}, Notes: []supplierNoteView{}, PriceReferences: []supplierPriceRefView{}}

	if rows, err := h.DB.Query(r.Context(), `
		SELECT id, COALESCE(contact_name,''), method, value FROM supplier_contacts WHERE supplier_id=$1 ORDER BY id`, id); err == nil {
		defer rows.Close()
		for rows.Next() {
			var c supplierContactView
			if rows.Scan(&c.ID, &c.ContactName, &c.Method, &c.Value) == nil {
				detail.Contacts = append(detail.Contacts, c)
			}
		}
	}
	if rows, err := h.DB.Query(r.Context(), `
		SELECT sn.id, sn.note, COALESCE(u.name,'-'), sn.created_at
		FROM supplier_notes sn LEFT JOIN users u ON u.id = sn.created_by
		WHERE sn.supplier_id=$1 ORDER BY sn.created_at DESC`, id); err == nil {
		defer rows.Close()
		for rows.Next() {
			var n supplierNoteView
			var createdAt time.Time
			if rows.Scan(&n.ID, &n.Note, &n.CreatedBy, &createdAt) == nil {
				n.CreatedAt = createdAt.Format(time.RFC3339)
				detail.Notes = append(detail.Notes, n)
			}
		}
	}
	if rows, err := h.DB.Query(r.Context(), `
		SELECT id, category, price_min, price_max FROM supplier_price_references WHERE supplier_id=$1 ORDER BY category`, id); err == nil {
		defer rows.Close()
		for rows.Next() {
			var p supplierPriceRefView
			if rows.Scan(&p.ID, &p.Category, &p.PriceMin, &p.PriceMax) == nil {
				detail.PriceReferences = append(detail.PriceReferences, p)
			}
		}
	}
	respondJSON(w, http.StatusOK, detail)
}

type supplierRequest struct {
	Name                string   `json:"name"`
	Status              string   `json:"status"`
	Source              string   `json:"source"`
	Category            string   `json:"category"`
	Customizable        bool     `json:"customizable"`
	ContactName         string   `json:"contact_name"`
	Phone               string   `json:"phone"`
	Address             string   `json:"address"`
	PaymentMethod       string   `json:"payment_method"`
	DefaultLeadTimeDays *int     `json:"default_lead_time_days"`
	MinOrderQty         *int     `json:"min_order_qty"`
	MinColorQty         *int     `json:"min_color_qty"`
	MinOrderAmount      *float64 `json:"min_order_amount"`
	OrderMultiple       *int     `json:"order_multiple"`
	MixedColorAllowed   *bool    `json:"mixed_color_allowed"`
	PackSetQty          *int     `json:"pack_set_qty"`
}

func (req supplierRequest) status() string {
	if req.Status == "" {
		return "active"
	}
	return req.Status
}

func (h *SupplierHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req supplierRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !validSupplierStatuses[req.status()] {
		respondError(w, http.StatusBadRequest, "invalid status")
		return
	}
	mixedColor := true
	if req.MixedColorAllowed != nil {
		mixedColor = *req.MixedColorAllowed
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO suppliers (name, status, source, category, customizable, contact_name, phone, address,
			payment_method, default_lead_time_days, min_order_qty, min_color_qty, min_order_amount,
			order_multiple, mixed_color_allowed, pack_set_qty)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
		req.Name, req.status(), req.Source, req.Category, req.Customizable, req.ContactName, req.Phone, req.Address,
		req.PaymentMethod, req.DefaultLeadTimeDays, req.MinOrderQty, req.MinColorQty, req.MinOrderAmount,
		req.OrderMultiple, mixedColor, req.PackSetQty).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create supplier")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *SupplierHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	var req supplierRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !validSupplierStatuses[req.status()] {
		respondError(w, http.StatusBadRequest, "invalid status")
		return
	}
	mixedColor := true
	if req.MixedColorAllowed != nil {
		mixedColor = *req.MixedColorAllowed
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE suppliers SET name=$1, status=$2, source=$3, category=$4, customizable=$5, contact_name=$6,
			phone=$7, address=$8, payment_method=$9, default_lead_time_days=$10, min_order_qty=$11,
			min_color_qty=$12, min_order_amount=$13, order_multiple=$14, mixed_color_allowed=$15, pack_set_qty=$16
		WHERE id=$17`,
		req.Name, req.status(), req.Source, req.Category, req.Customizable, req.ContactName, req.Phone, req.Address,
		req.PaymentMethod, req.DefaultLeadTimeDays, req.MinOrderQty, req.MinColorQty, req.MinOrderAmount,
		req.OrderMultiple, mixedColor, req.PackSetQty, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update supplier")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "supplier not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SupplierHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM suppliers WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "supplier has purchase or product history; set it to inactive instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete supplier")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Contacts ---

type supplierContactRequest struct {
	ContactName string `json:"contact_name"`
	Method      string `json:"method"`
	Value       string `json:"value"`
}

func (h *SupplierHandler) CreateContact(w http.ResponseWriter, r *http.Request) {
	supplierID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	var req supplierContactRequest
	if err := decodeJSON(r, &req); err != nil || req.Value == "" {
		respondError(w, http.StatusBadRequest, "value is required")
		return
	}
	if req.Method == "" {
		req.Method = "other"
	}
	var id int
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO supplier_contacts (supplier_id, contact_name, method, value) VALUES ($1,$2,$3,$4) RETURNING id`,
		supplierID, req.ContactName, req.Method, req.Value).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add contact")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *SupplierHandler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "contactId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid contact id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM supplier_contacts WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove contact")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Notes (append-only log) ---

type supplierNoteRequest struct {
	Note string `json:"note"`
}

func (h *SupplierHandler) CreateNote(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	supplierID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	var req supplierNoteRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "note is required")
		return
	}
	var createdBy *int
	if claims != nil {
		createdBy = &claims.UserID
	}
	var id int
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO supplier_notes (supplier_id, note, created_by) VALUES ($1,$2,$3) RETURNING id`,
		supplierID, req.Note, createdBy).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add note")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// --- Price References ---

type supplierPriceRefRequest struct {
	Category string   `json:"category"`
	PriceMin *float64 `json:"price_min"`
	PriceMax *float64 `json:"price_max"`
}

func (h *SupplierHandler) CreatePriceReference(w http.ResponseWriter, r *http.Request) {
	supplierID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	var req supplierPriceRefRequest
	if err := decodeJSON(r, &req); err != nil || req.Category == "" {
		respondError(w, http.StatusBadRequest, "category is required")
		return
	}
	var id int
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO supplier_price_references (supplier_id, category, price_min, price_max) VALUES ($1,$2,$3,$4) RETURNING id`,
		supplierID, req.Category, req.PriceMin, req.PriceMax).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add price reference")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *SupplierHandler) DeletePriceReference(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "priceRefId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid price reference id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM supplier_price_references WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove price reference")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
