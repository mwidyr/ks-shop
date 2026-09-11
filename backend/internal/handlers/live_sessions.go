package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LiveSessionHandler powers Panel Siaran (Konsol Siaran): a live-selling session per host with
// its own draft/live/ended lifecycle and a "keranjang live" of products at live-only prices.
// No real streaming integration - peak_viewers has no real data source and stays a manual/zero
// field, everything else (cart, order count) is real.
type LiveSessionHandler struct {
	DB *pgxpool.Pool
}

type liveSessionView struct {
	ID          int     `json:"id"`
	HostID      *int    `json:"host_id"`
	HostName    string  `json:"host_name"`
	Label       string  `json:"label"`
	Status      string  `json:"status"`
	StartedAt   *string `json:"started_at"`
	EndedAt     *string `json:"ended_at"`
	CreatedAt   string  `json:"created_at"`
	PeakViewers int     `json:"peak_viewers"`
	CartCount   int     `json:"cart_count"`
	OrderCount  int     `json:"order_count"`
}

func scanLiveSession(rows interface {
	Scan(...interface{}) error
}) (liveSessionView, error) {
	var s liveSessionView
	var createdAt time.Time
	var startedAt, endedAt *time.Time
	err := rows.Scan(&s.ID, &s.HostID, &s.HostName, &s.Label, &s.Status, &startedAt, &endedAt, &createdAt,
		&s.PeakViewers, &s.CartCount, &s.OrderCount)
	if err != nil {
		return s, err
	}
	s.CreatedAt = createdAt.Format(time.RFC3339)
	if startedAt != nil {
		v := startedAt.Format(time.RFC3339)
		s.StartedAt = &v
	}
	if endedAt != nil {
		v := endedAt.Format(time.RFC3339)
		s.EndedAt = &v
	}
	return s, nil
}

const liveSessionSelect = `
	SELECT ls.id, ls.host_id, COALESCE(h.name,'-'), ls.label, ls.status, ls.started_at, ls.ended_at, ls.created_at,
	       ls.peak_viewers,
	       COALESCE((SELECT COUNT(*) FROM live_session_products lsp WHERE lsp.live_session_id = ls.id), 0),
	       COALESCE((SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi WHERE oi.live_session_id = ls.id), 0)
	FROM live_sessions ls LEFT JOIN hosts h ON h.id = ls.host_id`

// List returns sessions (newest first), optionally filtered by ?host_id= and ?status=.
func (h *LiveSessionHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := " WHERE 1=1 "
	args := []interface{}{}
	argN := 1
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND ls.host_id = $" + strconv.Itoa(argN)
		args = append(args, hostID)
		argN++
	}
	if status := q.Get("status"); status != "" {
		where += " AND ls.status = $" + strconv.Itoa(argN)
		args = append(args, status)
		argN++
	}

	rows, err := h.DB.Query(r.Context(), liveSessionSelect+where+" ORDER BY ls.created_at DESC LIMIT 100", args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch live sessions")
		return
	}
	defer rows.Close()

	list := []liveSessionView{}
	for rows.Next() {
		s, err := scanLiveSession(rows)
		if err != nil {
			continue
		}
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type liveSessionProductView struct {
	ID          int     `json:"id"`
	VariantID   int     `json:"variant_id"`
	ProductName string  `json:"product_name"`
	Color       string  `json:"color"`
	Size        string  `json:"size"`
	SKU         string  `json:"sku"`
	Price       float64 `json:"price"`
	LivePrice   float64 `json:"live_price"`
}

// Detail returns one session plus its live cart items.
func (h *LiveSessionHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	row := h.DB.QueryRow(r.Context(), liveSessionSelect+" WHERE ls.id=$1", id)
	s, err := scanLiveSession(row)
	if err != nil {
		respondError(w, http.StatusNotFound, "session not found")
		return
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT lsp.id, pv.id, p.name, pv.color, pv.size, pv.sku, pv.price, lsp.live_price
		FROM live_session_products lsp
		JOIN product_variants pv ON pv.id = lsp.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE lsp.live_session_id = $1 ORDER BY lsp.created_at`, id)
	cart := []liveSessionProductView{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var c liveSessionProductView
			if err := rows.Scan(&c.ID, &c.VariantID, &c.ProductName, &c.Color, &c.Size, &c.SKU, &c.Price, &c.LivePrice); err != nil {
				continue
			}
			cart = append(cart, c)
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"session": s, "cart": cart})
}

type createLiveSessionRequest struct {
	HostID *int   `json:"host_id"`
	Label  string `json:"label"`
}

// Create makes a new draft session. host_id is optional at creation (matches the reference's
// simple "Tambah Sesi Siaran" form, which only asks for a name) and can be attached later.
func (h *LiveSessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createLiveSessionRequest
	if err := decodeJSON(r, &req); err != nil || req.Label == "" {
		respondError(w, http.StatusBadRequest, "label is required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO live_sessions (host_id, label, status) VALUES ($1,$2,'draft') RETURNING id`,
		req.HostID, req.Label).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

type updateLiveSessionRequest struct {
	Label  *string `json:"label"`
	HostID *int    `json:"host_id"`
}

// Update edits a draft session's name and/or attached host (the "Edit" link on Nama Sesi, and
// the host-picker step in the Konsol Siaran launcher).
func (h *LiveSessionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	var req updateLiveSessionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Label != nil {
		if _, err := h.DB.Exec(r.Context(), `UPDATE live_sessions SET label=$1 WHERE id=$2`, *req.Label, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update session")
			return
		}
	}
	if req.HostID != nil {
		if _, err := h.DB.Exec(r.Context(), `UPDATE live_sessions SET host_id=$1 WHERE id=$2`, *req.HostID, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update session host")
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GoLive transitions a draft session to live (requires a host to be attached first).
func (h *LiveSessionHandler) GoLive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	var hostID *int
	if err := h.DB.QueryRow(r.Context(), `SELECT host_id FROM live_sessions WHERE id=$1 AND status='draft'`, id).Scan(&hostID); err != nil {
		respondError(w, http.StatusNotFound, "draft session not found")
		return
	}
	if hostID == nil {
		respondError(w, http.StatusBadRequest, "pilih host terlebih dahulu sebelum mulai siaran")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE live_sessions SET status='live', started_at=now() WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to start session")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// End marks a live session as ended.
func (h *LiveSessionHandler) End(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE live_sessions SET status='ended', ended_at=now() WHERE id=$1 AND status='live'`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to end session")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "live session not found or already ended")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type addCartProductRequest struct {
	VariantID int     `json:"variant_id"`
	LivePrice float64 `json:"live_price"`
}

// AddProduct adds one variant to the session's live cart at a live-only price.
func (h *LiveSessionHandler) AddProduct(w http.ResponseWriter, r *http.Request) {
	sessionID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	var req addCartProductRequest
	if err := decodeJSON(r, &req); err != nil || req.VariantID == 0 || req.LivePrice <= 0 {
		respondError(w, http.StatusBadRequest, "variant_id and live_price (>0) are required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO live_session_products (live_session_id, variant_id, live_price) VALUES ($1,$2,$3) RETURNING id`,
		sessionID, req.VariantID, req.LivePrice).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add product to live cart")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// RemoveProduct removes one item from the session's live cart.
func (h *LiveSessionHandler) RemoveProduct(w http.ResponseWriter, r *http.Request) {
	cartItemID, err := strconv.Atoi(chi.URLParam(r, "productId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid cart item id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM live_session_products WHERE id=$1`, cartItemID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove product")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
