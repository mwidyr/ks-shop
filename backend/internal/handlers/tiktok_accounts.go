package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// TikTokHandler manages the TikTok accounts (status, device, location, room, login details, notes) and the
// Location > Room > Device structure they hang under. Locations are the existing Host Management Locations.
type TikTokHandler struct {
	DB *pgxpool.Pool
}

var tiktokStatuses = []string{"LIVE", "BACKUP", "BLOCKED", "OHCA"}

func validTikTokStatus(s string) bool {
	for _, v := range tiktokStatuses {
		if v == s {
			return true
		}
	}
	return false
}

// canSeeCredentials: passwords, 2FA codes and e-mail logins are only returned to the Super Admin and Management.
func canSeeCredentials(role string) bool { return role == "super_user" || role == "management" }

const defaultRoomsPerLocation = 5

// ensureDefaultRooms gives every active Location its ROOM001-ROOM005 (new Locations get them on first use).
func ensureDefaultRooms(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		INSERT INTO tiktok_rooms (location_id, name)
		SELECT l.id, 'ROOM' || lpad(n::text, 3, '0')
		FROM host_locations l CROSS JOIN generate_series(1, $1) AS n
		WHERE l.is_active = true
		ON CONFLICT (location_id, name) DO NOTHING`, defaultRoomsPerLocation)
	return err
}

type tiktokDeviceView struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type tiktokRoomView struct {
	ID      int                `json:"id"`
	Name    string             `json:"name"`
	Devices []tiktokDeviceView `json:"devices"`
}

type tiktokLocationView struct {
	ID    int              `json:"id"`
	Name  string           `json:"name"`
	Rooms []tiktokRoomView `json:"rooms"`
}

// Structure returns every active Location with its rooms and devices (one call feeds the settings tab, the
// filters and the account form).
func (h *TikTokHandler) Structure(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if err := ensureDefaultRooms(ctx, h.DB); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to prepare rooms")
		return
	}
	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.name, rm.id, rm.name, d.id, d.name
		FROM host_locations l
		JOIN tiktok_rooms rm ON rm.location_id = l.id
		LEFT JOIN tiktok_devices d ON d.room_id = rm.id
		WHERE l.is_active = true
		ORDER BY l.sort_order, l.name, rm.name, d.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load structure")
		return
	}
	defer rows.Close()
	out := []tiktokLocationView{}
	for rows.Next() {
		var locID, roomID int
		var locName, roomName string
		var devID *int
		var devName *string
		if err := rows.Scan(&locID, &locName, &roomID, &roomName, &devID, &devName); err != nil {
			continue
		}
		if len(out) == 0 || out[len(out)-1].ID != locID {
			out = append(out, tiktokLocationView{ID: locID, Name: locName, Rooms: []tiktokRoomView{}})
		}
		loc := &out[len(out)-1]
		if len(loc.Rooms) == 0 || loc.Rooms[len(loc.Rooms)-1].ID != roomID {
			loc.Rooms = append(loc.Rooms, tiktokRoomView{ID: roomID, Name: roomName, Devices: []tiktokDeviceView{}})
		}
		if devID != nil {
			room := &loc.Rooms[len(loc.Rooms)-1]
			room.Devices = append(room.Devices, tiktokDeviceView{ID: *devID, Name: *devName})
		}
	}
	respondJSON(w, http.StatusOK, out)
}

type tiktokDeviceRequest struct {
	RoomID int    `json:"room_id"`
	Name   string `json:"name"`
}

// CreateDevice adds a device under a room.
func (h *TikTokHandler) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var req tiktokDeviceRequest
	if err := decodeJSON(r, &req); err != nil || req.RoomID == 0 || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "room_id and name are required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `INSERT INTO tiktok_devices (room_id, name) VALUES ($1,$2) RETURNING id`, req.RoomID, strings.TrimSpace(req.Name)).Scan(&id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to add device (unknown room?)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// UpdateDevice renames a device and/or moves it to another room (which can be in another Location).
func (h *TikTokHandler) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req tiktokDeviceRequest
	if err != nil || decodeJSON(r, &req) != nil || req.RoomID == 0 || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "room_id and name are required")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE tiktok_devices SET name=$1, room_id=$2 WHERE id=$3`, strings.TrimSpace(req.Name), req.RoomID, id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to update device (unknown room?)")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "device not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type tiktokAccountRow struct {
	ID           int     `json:"id"`
	TikTokID     string  `json:"tiktok_id"`
	Status       string  `json:"status"`
	DeviceID     *int    `json:"device_id"`
	DeviceName   *string `json:"device_name"`
	LocationID   *int    `json:"location_id"`
	LocationName *string `json:"location_name"`
	RoomID       *int    `json:"room_id"`
	RoomName     *string `json:"room_name"`
}

type tiktokListResponse struct {
	Counts   map[string]int     `json:"counts"`
	Accounts []tiktokAccountRow `json:"accounts"`
}

const tiktokSelect = `
	SELECT a.id, a.tiktok_id, a.status, a.device_id, d.name, a.location_id, l.name, a.room_id, rm.name
	FROM tiktok_accounts a
	LEFT JOIN tiktok_devices d ON d.id = a.device_id
	LEFT JOIN host_locations l ON l.id = a.location_id
	LEFT JOIN tiktok_rooms rm ON rm.id = a.room_id`

func scanTikTokRow(rows pgx.Rows) (tiktokAccountRow, error) {
	var a tiktokAccountRow
	err := rows.Scan(&a.ID, &a.TikTokID, &a.Status, &a.DeviceID, &a.DeviceName, &a.LocationID, &a.LocationName, &a.RoomID, &a.RoomName)
	return a, err
}

// List returns the accounts (filters: status, location_id, room_id, device_id, q) and the per-status totals of ALL accounts.
func (h *TikTokHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	q := r.URL.Query()
	conds := []string{}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(len(args))))
	}
	if s := strings.ToUpper(q.Get("status")); validTikTokStatus(s) {
		add("a.status = ?", s)
	}
	for param, col := range map[string]string{"location_id": "a.location_id", "room_id": "a.room_id", "device_id": "a.device_id"} {
		if id, err := strconv.Atoi(q.Get(param)); err == nil {
			add(col+" = ?", id)
		}
	}
	if s := strings.TrimSpace(q.Get("q")); s != "" {
		like := "%" + escapeLike(s) + "%"
		args = append(args, like)
		n := "$" + strconv.Itoa(len(args))
		search := `a.tiktok_id ILIKE ` + n + ` OR d.name ILIKE ` + n + ` OR l.name ILIKE ` + n + ` OR rm.name ILIKE ` + n +
			` OR EXISTS (SELECT 1 FROM tiktok_account_notes tn WHERE tn.account_id = a.id AND tn.body ILIKE ` + n + `)`
		if canSeeCredentials(claims.Role) {
			search += ` OR a.email ILIKE ` + n
		}
		conds = append(conds, "("+search+")")
	}
	query := tiktokSelect
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	query += " ORDER BY CASE a.status WHEN 'LIVE' THEN 0 WHEN 'BACKUP' THEN 1 WHEN 'OHCA' THEN 2 ELSE 3 END, lower(a.tiktok_id)"
	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load accounts")
		return
	}
	defer rows.Close()
	res := tiktokListResponse{Counts: map[string]int{"LIVE": 0, "BACKUP": 0, "BLOCKED": 0, "OHCA": 0}, Accounts: []tiktokAccountRow{}}
	for rows.Next() {
		if a, err := scanTikTokRow(rows); err == nil {
			res.Accounts = append(res.Accounts, a)
		}
	}
	rows.Close()
	cr, err := h.DB.Query(ctx, `SELECT status, count(*) FROM tiktok_accounts GROUP BY status`)
	if err == nil {
		defer cr.Close()
		for cr.Next() {
			var s string
			var n int
			if cr.Scan(&s, &n) == nil {
				res.Counts[s] = n
			}
		}
	}
	respondJSON(w, http.StatusOK, res)
}

type tiktokNoteView struct {
	ID        int    `json:"id"`
	Author    string `json:"author"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

type tiktokAccountDetail struct {
	tiktokAccountRow
	AccountLevel     int              `json:"account_level"`
	AccountCreatedOn *string          `json:"account_created_on"`
	CanSeeCredential bool             `json:"can_see_credentials"`
	Password         string           `json:"password"`
	TwoFA            string           `json:"twofa"`
	Email            string           `json:"email"`
	EmailPassword    string           `json:"email_password"`
	Notes            []tiktokNoteView `json:"notes"`
}

func (h *TikTokHandler) loadDetail(ctx context.Context, id int, role string) (*tiktokAccountDetail, error) {
	rows, err := h.DB.Query(ctx, tiktokSelect+` WHERE a.id = $1`, id)
	if err != nil {
		return nil, err
	}
	var d tiktokAccountDetail
	if rows.Next() {
		d.tiktokAccountRow, err = scanTikTokRow(rows)
	} else {
		err = pgx.ErrNoRows
	}
	rows.Close()
	if err != nil {
		return nil, err
	}
	d.CanSeeCredential = canSeeCredentials(role)
	var created *string
	var pw, fa, em, emPw string
	if err := h.DB.QueryRow(ctx, `SELECT account_level, account_created_on::text, password, twofa, email, email_password FROM tiktok_accounts WHERE id=$1`, id).
		Scan(&d.AccountLevel, &created, &pw, &fa, &em, &emPw); err != nil {
		return nil, err
	}
	d.AccountCreatedOn = created
	if d.CanSeeCredential {
		d.Password, d.TwoFA, d.Email, d.EmailPassword = pw, fa, em, emPw
	}
	d.Notes = []tiktokNoteView{}
	nr, err := h.DB.Query(ctx, `SELECT id, author, body, created_at::text FROM tiktok_account_notes WHERE account_id=$1 ORDER BY created_at, id`, id)
	if err == nil {
		defer nr.Close()
		for nr.Next() {
			var n tiktokNoteView
			if nr.Scan(&n.ID, &n.Author, &n.Body, &n.CreatedAt) == nil {
				d.Notes = append(d.Notes, n)
			}
		}
	}
	return &d, nil
}

// Detail returns one account with its notes. Login details only for roles that may see them.
func (h *TikTokHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	d, err := h.loadDetail(r.Context(), id, appmw.GetClaims(r).Role)
	if errors.Is(err, pgx.ErrNoRows) {
		respondError(w, http.StatusNotFound, "account not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load account")
		return
	}
	respondJSON(w, http.StatusOK, d)
}

type tiktokAccountRequest struct {
	TikTokID         string  `json:"tiktok_id"`
	Status           string  `json:"status"`
	DeviceID         *int    `json:"device_id"`
	RoomID           *int    `json:"room_id"`
	LocationID       *int    `json:"location_id"`
	AccountLevel     int     `json:"account_level"`
	AccountCreatedOn *string `json:"account_created_on"`
	Password         *string `json:"password"`
	TwoFA            *string `json:"twofa"`
	Email            *string `json:"email"`
	EmailPassword    *string `json:"email_password"`
}

func (req *tiktokAccountRequest) clean() string {
	req.TikTokID = cleanTikTokID(req.TikTokID)
	req.Status = strings.ToUpper(strings.TrimSpace(req.Status))
	if req.Status == "" {
		req.Status = "BACKUP"
	}
	switch {
	case req.TikTokID == "" || strings.ContainsAny(req.TikTokID, " /\\"):
		return "TikTok ID is required (no spaces)"
	case !validTikTokStatus(req.Status):
		return "invalid status"
	case req.AccountLevel < 0:
		return "account level must be 0 or more"
	}
	if req.AccountCreatedOn != nil && strings.TrimSpace(*req.AccountCreatedOn) == "" {
		req.AccountCreatedOn = nil
	}
	return ""
}

// Create adds an account. Device, location and room are optional; login details are saved only for roles that may handle them.
func (h *TikTokHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req tiktokAccountRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := req.clean(); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	secret := canSeeCredentials(appmw.GetClaims(r).Role)
	val := func(p *string) string {
		if p == nil || !secret {
			return ""
		}
		return *p
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO tiktok_accounts (tiktok_id, status, device_id, room_id, location_id, account_level, account_created_on, password, twofa, email, email_password)
		VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11) RETURNING id`,
		req.TikTokID, req.Status, req.DeviceID, req.RoomID, req.LocationID, req.AccountLevel, req.AccountCreatedOn,
		val(req.Password), val(req.TwoFA), val(req.Email), val(req.EmailPassword)).Scan(&id)
	if isUniqueViolation(err) {
		respondError(w, http.StatusConflict, "this TikTok ID already exists")
		return
	}
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to create account (check device / room / location / date)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Update saves an account. Login fields are only touched for roles that may see them (others' values are left as they are).
func (h *TikTokHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req tiktokAccountRequest
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if msg := req.clean(); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	secret := canSeeCredentials(appmw.GetClaims(r).Role)
	pick := func(p *string) *string {
		if !secret {
			return nil
		}
		return p
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE tiktok_accounts SET tiktok_id=$1, status=$2, device_id=$3, room_id=$4, location_id=$5, account_level=$6,
		       account_created_on=$7::date,
		       password=COALESCE($8, password), twofa=COALESCE($9, twofa), email=COALESCE($10, email), email_password=COALESCE($11, email_password),
		       updated_at=now()
		WHERE id=$12`,
		req.TikTokID, req.Status, req.DeviceID, req.RoomID, req.LocationID, req.AccountLevel, req.AccountCreatedOn,
		pick(req.Password), pick(req.TwoFA), pick(req.Email), pick(req.EmailPassword), id)
	if isUniqueViolation(err) {
		respondError(w, http.StatusConflict, "this TikTok ID already exists")
		return
	}
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to save account (check device / room / location / date)")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "account not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// AddNote appends one note (author + time are recorded; notes are never edited in place).
func (h *TikTokHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		Body string `json:"body"`
	}
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Body) == "" {
		respondError(w, http.StatusBadRequest, "note text is required")
		return
	}
	claims := appmw.GetClaims(r)
	var note tiktokNoteView
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO tiktok_account_notes (account_id, user_id, author, body)
		SELECT id, $2, $3, $4 FROM tiktok_accounts WHERE id = $1
		RETURNING id, author, body, created_at::text`, id, claims.UserID, claims.Name, strings.TrimSpace(req.Body)).
		Scan(&note.ID, &note.Author, &note.Body, &note.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		respondError(w, http.StatusNotFound, "account not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save note")
		return
	}
	respondJSON(w, http.StatusCreated, note)
}

// DeleteNote removes one note of an account (the page asks for confirmation first).
func (h *TikTokHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	accountID, err1 := strconv.Atoi(chi.URLParam(r, "id"))
	noteID, err2 := strconv.Atoi(chi.URLParam(r, "noteId"))
	if err1 != nil || err2 != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM tiktok_account_notes WHERE id=$1 AND account_id=$2`, noteID, accountID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete note")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "note not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
