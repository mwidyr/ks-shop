package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// ---- Shift Schedule ---------------------------------------------------------------------------

type attendanceStatus struct {
	ID          int    `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	IsPaid      bool   `json:"is_paid"`
	DeductBonus bool   `json:"deduct_bonus"`
	BgColor     string `json:"bg_color"`
	TextColor   string `json:"text_color"`
	IsActive    bool   `json:"is_active"`
	IsDefault   bool   `json:"is_default"`
}

func (h *EmployeeHandler) loadStatuses(r *http.Request) []attendanceStatus {
	rows, err := h.DB.Query(r.Context(), `SELECT id, code, name, is_paid, deduct_bonus, bg_color, text_color, is_active, is_default FROM attendance_statuses ORDER BY sort_order, id`)
	out := []attendanceStatus{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s attendanceStatus
		if rows.Scan(&s.ID, &s.Code, &s.Name, &s.IsPaid, &s.DeductBonus, &s.BgColor, &s.TextColor, &s.IsActive, &s.IsDefault) == nil {
			out = append(out, s)
		}
	}
	return out
}

type scheduleEmployee struct {
	ID       int            `json:"id"`
	Nickname string         `json:"nickname"`
	FullName string         `json:"full_name"`
	Location string         `json:"location"`
	Records  map[string]int `json:"records"` // only dates that differ from the default status
}

// Schedule returns one month for the employees of a Location (or all). A date without a record is the default status (Working).
func (h *EmployeeHandler) Schedule(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	first, start, err := monthStart(r.URL.Query().Get("month"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	end := start.AddDate(0, 1, 0)
	dates := []string{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		dates = append(dates, d.Format("2006-01-02"))
	}
	conds, args := []string{"(e.status IN ('full_time','probationary') OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.employee_id = e.id AND ar.work_date >= $1::date AND ar.work_date < $2::date))",
		"(e.join_date IS NULL OR e.join_date < $2::date)"}, []any{first, end.Format("2006-01-02")}
	if id, err := strconv.Atoi(r.URL.Query().Get("location_id")); err == nil {
		args = append(args, id)
		conds = append(conds, "e.location_id = $"+strconv.Itoa(len(args)))
	}
	rows, err := h.DB.Query(ctx, `
		SELECT e.id, e.nickname, e.full_name, l.name FROM employees e JOIN employee_locations l ON l.id = e.location_id
		WHERE `+strings.Join(conds, " AND ")+` ORDER BY l.is_default DESC, l.name, e.id`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	emps := []scheduleEmployee{}
	index := map[int]int{}
	ids := []int{}
	for rows.Next() {
		var e scheduleEmployee
		if rows.Scan(&e.ID, &e.Nickname, &e.FullName, &e.Location) == nil {
			e.Records = map[string]int{}
			index[e.ID] = len(emps)
			emps = append(emps, e)
			ids = append(ids, e.ID)
		}
	}
	rows.Close()
	if len(ids) > 0 {
		rr, err := h.DB.Query(ctx, `SELECT employee_id, work_date::text, status_id FROM attendance_records WHERE employee_id = ANY($1) AND work_date >= $2::date AND work_date < $3::date`, ids, first, end.Format("2006-01-02"))
		if err == nil {
			for rr.Next() {
				var id, sid int
				var d string
				if rr.Scan(&id, &d, &sid) == nil {
					emps[index[id]].Records[d] = sid
				}
			}
			rr.Close()
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{"month": first[:7], "dates": dates, "statuses": h.loadStatuses(r), "employees": emps, "locations": h.loadLocations(ctx, true)})
}

// SaveSchedule applies one status to a set of (employee, date) cells. Setting the default status simply removes the record.
func (h *EmployeeHandler) SaveSchedule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Changes []struct {
			EmployeeID int      `json:"employee_id"`
			Dates      []string `json:"dates"`
			StatusID   int      `json:"status_id"`
		} `json:"changes"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.Changes) == 0 {
		respondError(w, http.StatusBadRequest, "no changes")
		return
	}
	ctx := r.Context()
	statuses := map[int]attendanceStatus{}
	for _, s := range h.loadStatuses(r) {
		statuses[s.ID] = s
	}
	cells := 0
	for _, c := range req.Changes {
		s, ok := statuses[c.StatusID]
		if !ok || (!s.IsActive && !s.IsDefault) {
			respondError(w, http.StatusBadRequest, "unknown or inactive attendance status")
			return
		}
		cells += len(c.Dates)
		for _, d := range c.Dates {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				respondError(w, http.StatusBadRequest, "dates must be YYYY-MM-DD")
				return
			}
		}
	}
	if cells == 0 || cells > 5000 {
		respondError(w, http.StatusBadRequest, "between 1 and 5000 cells per save")
		return
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	for _, c := range req.Changes {
		if statuses[c.StatusID].IsDefault {
			_, err = tx.Exec(ctx, `DELETE FROM attendance_records WHERE employee_id=$1 AND work_date = ANY($2::text[]::date[])`, c.EmployeeID, c.Dates)
		} else {
			_, err = tx.Exec(ctx, `
				INSERT INTO attendance_records (employee_id, work_date, status_id)
				SELECT $1, d::date, $3 FROM unnest($2::text[]) AS d
				ON CONFLICT (employee_id, work_date) DO UPDATE SET status_id = EXCLUDED.status_id`, c.EmployeeID, c.Dates, c.StatusID)
		}
		if err != nil {
			respondError(w, http.StatusBadRequest, "failed to save the schedule (unknown employee?)")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"saved": cells})
}

// ---- Settings: Employee Locations + Attendance Statuses --------------------------------------

func (h *EmployeeHandler) ScheduleSettings(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{"locations": h.loadLocations(r.Context(), false), "statuses": h.loadStatuses(r)})
}

type locationRequest struct {
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

func (h *EmployeeHandler) CreateLocation(w http.ResponseWriter, r *http.Request) {
	var req locationRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `INSERT INTO employee_locations (name) VALUES ($1) RETURNING id`, strings.TrimSpace(req.Name)).Scan(&id)
	if isUniqueViolation(err) {
		respondError(w, http.StatusConflict, "this Location already exists")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add location")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// UpdateLocation renames or (de)activates a Location. General, the default, always stays active.
func (h *EmployeeHandler) UpdateLocation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req locationRequest
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE employee_locations SET name=$1, is_active = ($2 OR is_default) WHERE id=$3`, strings.TrimSpace(req.Name), active, id)
	if isUniqueViolation(err) {
		respondError(w, http.StatusConflict, "this Location already exists")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update location")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "location not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

var statusColors = map[string]bool{"green": true, "blue": true, "red": true, "yellow": true, "gray": true, "purple": true, "orange": true, "teal": true, "brown": true, "black": true, "white": true}

type statusRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	IsPaid      bool   `json:"is_paid"`
	DeductBonus bool   `json:"deduct_bonus"`
	BgColor     string `json:"bg_color"`
	TextColor   string `json:"text_color"`
	IsActive    *bool  `json:"is_active"`
}

func (s *statusRequest) clean() string {
	s.Code, s.Name = strings.ToUpper(strings.TrimSpace(s.Code)), strings.TrimSpace(s.Name)
	switch {
	case s.Name == "":
		return "name is required"
	case !statusColors[s.BgColor] || !statusColors[s.TextColor]:
		return "choose a background and text color"
	}
	return ""
}

// CreateStatus adds an attendance status; it shows up in the schedule's status menu right away.
func (h *EmployeeHandler) CreateStatus(w http.ResponseWriter, r *http.Request) {
	var req statusRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := req.clean(); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	if req.Code == "" || len(req.Code) > 10 || strings.ContainsAny(req.Code, " ") {
		respondError(w, http.StatusBadRequest, "code is required (up to 10 characters, no spaces)")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO attendance_statuses (code, name, is_paid, deduct_bonus, bg_color, text_color, sort_order)
		VALUES ($1,$2,$3,$4,$5,$6, COALESCE((SELECT max(sort_order) FROM attendance_statuses), 0) + 1) RETURNING id`,
		req.Code, req.Name, req.IsPaid, req.DeductBonus, req.BgColor, req.TextColor).Scan(&id)
	if isUniqueViolation(err) {
		respondError(w, http.StatusConflict, "this code already exists")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add status")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// UpdateStatus edits a status (the code never changes). Existing attendance records keep pointing at it; the default
// status (Working) cannot be deactivated.
func (h *EmployeeHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req statusRequest
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if msg := req.clean(); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE attendance_statuses SET name=$1, is_paid=$2, deduct_bonus=$3, bg_color=$4, text_color=$5, is_active = ($6 OR is_default) WHERE id=$7`,
		req.Name, req.IsPaid, req.DeductBonus, req.BgColor, req.TextColor, active, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update status")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "status not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
