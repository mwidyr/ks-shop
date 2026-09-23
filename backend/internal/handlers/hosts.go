package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type HostHandler struct {
	DB *pgxpool.Pool
}

type hostView struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	Platform     string  `json:"platform"`
	IsActive     bool    `json:"is_active"`
	LocationID   int     `json:"location_id"`
	LocationName string  `json:"location_name"`
	Shift        *string `json:"shift"`
}

// List returns active hosts by default; pass ?include_inactive=true for the Settings page,
// and ?location_id= to narrow to one Location Tag (item 021).
//
// Order is Morning -> Middle -> Evening -> no shift, then name (item 022) - this is the one
// place the order is decided, so every page that lists hosts (Host Management, the live
// session host picker, filter dropdowns, and any future Performance Dashboard/Heatmap)
// inherits it automatically just by calling this endpoint.
func (h *HostHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT hosts.id, hosts.name, COALESCE(hosts.platform,''), hosts.is_active,
		       hosts.location_id, host_locations.name, hosts.shift
		FROM hosts
		JOIN host_locations ON host_locations.id = hosts.location_id`
	conds := []string{}
	args := []any{}
	if r.URL.Query().Get("include_inactive") != "true" {
		conds = append(conds, "hosts.is_active = true")
	}
	if locID := r.URL.Query().Get("location_id"); locID != "" {
		if id, err := strconv.Atoi(locID); err == nil {
			args = append(args, id)
			conds = append(conds, "hosts.location_id = $"+strconv.Itoa(len(args)))
		}
	}
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	query += `
		ORDER BY CASE hosts.shift
			WHEN 'morning' THEN 0
			WHEN 'middle' THEN 1
			WHEN 'evening' THEN 2
			ELSE 3
		END, hosts.name`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch hosts")
		return
	}
	defer rows.Close()

	list := []hostView{}
	for rows.Next() {
		var host hostView
		rows.Scan(&host.ID, &host.Name, &host.Platform, &host.IsActive, &host.LocationID, &host.LocationName, &host.Shift)
		list = append(list, host)
	}
	respondJSON(w, http.StatusOK, list)
}

var validShifts = map[string]bool{"morning": true, "middle": true, "evening": true}

type hostRequest struct {
	Name       string  `json:"name"`
	Platform   string  `json:"platform"`
	IsActive   *bool   `json:"is_active"`
	LocationID int     `json:"location_id"`
	Shift      *string `json:"shift"`
}

func (req hostRequest) shiftValue() (*string, bool) {
	if req.Shift == nil || *req.Shift == "" {
		return nil, true
	}
	if !validShifts[*req.Shift] {
		return nil, false
	}
	return req.Shift, true
}

func (h *HostHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req hostRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.LocationID == 0 {
		respondError(w, http.StatusBadRequest, "location_id is required")
		return
	}
	shift, ok := req.shiftValue()
	if !ok {
		respondError(w, http.StatusBadRequest, "invalid shift")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO hosts (name, platform, location_id, shift) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.Name, req.Platform, req.LocationID, shift).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create host")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *HostHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid host id")
		return
	}
	var req hostRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LocationID == 0 {
		respondError(w, http.StatusBadRequest, "location_id is required")
		return
	}
	shift, ok := req.shiftValue()
	if !ok {
		respondError(w, http.StatusBadRequest, "invalid shift")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE hosts SET name=$1, platform=$2, is_active=$3, location_id=$4, shift=$5 WHERE id=$6`,
		req.Name, req.Platform, isActive, req.LocationID, shift, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update host")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *HostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid host id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM hosts WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "host is used in existing orders; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete host")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
