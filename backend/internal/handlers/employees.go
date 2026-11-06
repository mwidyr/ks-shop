package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// EmployeeHandler serves the EMPLOYEE section: Employee List, Shift Schedule, Payroll and Bonus Ranking. Employee
// records are plain HR records (no login accounts) with their own Locations, separate from Host Management.
type EmployeeHandler struct {
	DB *pgxpool.Pool
}

var employeeStatuses = map[string]bool{"full_time": true, "probationary": true, "resigned": true, "fired": true}

var mbtiTypes = map[string]bool{
	"INTJ": true, "INTP": true, "ENTJ": true, "ENTP": true, "INFJ": true, "INFP": true, "ENFJ": true, "ENFP": true,
	"ISTJ": true, "ISFJ": true, "ESTJ": true, "ESFJ": true, "ISTP": true, "ISFP": true, "ESTP": true, "ESFP": true,
}

// canSeeSensitiveEmployee: NIK, address, bank and emergency-contact details are only for the Super Admin and Management.
func canSeeSensitiveEmployee(role string) bool { return role == "super_user" || role == "management" }

func activeEmployeeStatus(s string) bool { return s == "full_time" || s == "probationary" }

// monthStart parses "YYYY-MM" (default: the current month in Asia/Jakarta) into its first day as "YYYY-MM-01".
func monthStart(raw string) (string, time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		now := time.Now().In(reportZone)
		raw = now.Format("2006-01")
	}
	t, err := time.ParseInLocation("2006-01", raw, reportZone)
	if err != nil {
		return "", time.Time{}, errors.New("month must be YYYY-MM")
	}
	return t.Format("2006-01-02"), t, nil
}

func optDate(s *string) (*string, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	v := strings.TrimSpace(*s)
	if _, err := time.Parse("2006-01-02", v); err != nil {
		return nil, fmt.Errorf("date %q must be YYYY-MM-DD", v)
	}
	return &v, nil
}

// ---- meta -------------------------------------------------------------------------------------

type employeeLocation struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	IsDefault bool   `json:"is_default"`
}

func (h *EmployeeHandler) loadLocations(ctx context.Context, onlyActive bool) []employeeLocation {
	q := `SELECT id, name, is_active, is_default FROM employee_locations`
	if onlyActive {
		q += ` WHERE is_active = true`
	}
	rows, err := h.DB.Query(ctx, q+` ORDER BY is_default DESC, name`)
	out := []employeeLocation{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var l employeeLocation
		if rows.Scan(&l.ID, &l.Name, &l.IsActive, &l.IsDefault) == nil {
			out = append(out, l)
		}
	}
	return out
}

// Meta feeds the Employee List filters and form: positions, Employee Locations and the Hosts that can be linked.
func (h *EmployeeHandler) Meta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	type idName struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	positions, hosts := []idName{}, []idName{}
	if rows, err := h.DB.Query(ctx, `SELECT id, name FROM employee_positions ORDER BY name`); err == nil {
		for rows.Next() {
			var p idName
			if rows.Scan(&p.ID, &p.Name) == nil {
				positions = append(positions, p)
			}
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `SELECT id, name FROM hosts WHERE is_active = true ORDER BY name`); err == nil {
		for rows.Next() {
			var p idName
			if rows.Scan(&p.ID, &p.Name) == nil {
				hosts = append(hosts, p)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"positions": positions, "locations": h.loadLocations(ctx, true), "hosts": hosts,
		"can_see_sensitive": canSeeSensitiveEmployee(appmw.GetClaims(r).Role),
	})
}

// CreatePosition adds a position from inside the employee form (saved for future selection).
func (h *EmployeeHandler) CreatePosition(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	name := ""
	if decodeJSON(r, &req) == nil {
		name = strings.TrimSpace(req.Name)
	}
	if name == "" {
		respondError(w, http.StatusBadRequest, "position name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO employee_positions (name) VALUES ($1)
		ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, name).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add position")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"id": id, "name": name})
}

// ---- list / detail ----------------------------------------------------------------------------

type employeeRow struct {
	ID         int     `json:"id"`
	EmpCode    string  `json:"emp_code"`
	FullName   string  `json:"full_name"`
	Nickname   string  `json:"nickname"`
	PositionID int     `json:"position_id"`
	Position   string  `json:"position"`
	LocationID int     `json:"location_id"`
	Location   string  `json:"location"`
	Whatsapp   string  `json:"whatsapp"`
	Status     string  `json:"status"`
	JoinDate   *string `json:"join_date"`
	MBTI       string  `json:"mbti"`
	Birthday   *string `json:"birthday"`
	HostID     *int    `json:"host_id"`
	HostName   *string `json:"host_name"`
}

type employeeDetail struct {
	employeeRow
	CanSeeSensitive bool   `json:"can_see_sensitive"`
	NIK             string `json:"nik"`
	Address         string `json:"address"`
	BankHolder      string `json:"bank_holder"`
	BankName        string `json:"bank_name"`
	BankAccount     string `json:"bank_account"`
	EmergencyName   string `json:"emergency_name"`
	EmergencyNumber string `json:"emergency_number"`
}

const employeeSelect = `
	SELECT e.id, e.emp_code, e.full_name, e.nickname, e.position_id, p.name, e.location_id, l.name, e.whatsapp, e.status,
	       e.join_date::text, e.mbti, e.birthday::text, e.host_id, h.name,
	       e.nik, e.address, e.bank_holder, e.bank_name, e.bank_account, e.emergency_name, e.emergency_number
	FROM employees e
	JOIN employee_positions p ON p.id = e.position_id
	JOIN employee_locations l ON l.id = e.location_id
	LEFT JOIN hosts h ON h.id = e.host_id`

func scanEmployee(rows pgx.Rows, sensitive bool) (employeeDetail, error) {
	var d employeeDetail
	err := rows.Scan(&d.ID, &d.EmpCode, &d.FullName, &d.Nickname, &d.PositionID, &d.Position, &d.LocationID, &d.Location, &d.Whatsapp, &d.Status,
		&d.JoinDate, &d.MBTI, &d.Birthday, &d.HostID, &d.HostName,
		&d.NIK, &d.Address, &d.BankHolder, &d.BankName, &d.BankAccount, &d.EmergencyName, &d.EmergencyNumber)
	d.CanSeeSensitive = sensitive
	if !sensitive {
		d.NIK, d.Address, d.BankHolder, d.BankName, d.BankAccount, d.EmergencyName, d.EmergencyNumber = "", "", "", "", "", "", ""
	}
	return d, err
}

// List returns the employees (search + Location / Position / Status filters + the card filter) and the three card totals.
func (h *EmployeeHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	conds, args := []string{}, []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(len(args))))
	}
	if id, err := strconv.Atoi(q.Get("location_id")); err == nil {
		add("e.location_id = ?", id)
	}
	if id, err := strconv.Atoi(q.Get("position_id")); err == nil {
		add("e.position_id = ?", id)
	}
	if s := q.Get("status"); employeeStatuses[s] {
		add("e.status = ?", s)
	}
	switch q.Get("group") {
	case "active":
		conds = append(conds, "e.status IN ('full_time','probationary')")
	case "inactive":
		conds = append(conds, "e.status IN ('resigned','fired')")
	}
	if s := strings.TrimSpace(q.Get("q")); s != "" {
		args = append(args, "%"+escapeLike(s)+"%")
		n := "$" + strconv.Itoa(len(args))
		conds = append(conds, `(e.emp_code ILIKE `+n+` OR e.full_name ILIKE `+n+` OR e.nickname ILIKE `+n+` OR e.whatsapp ILIKE `+n+`)`)
	}
	query := employeeSelect
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	rows, err := h.DB.Query(ctx, query+" ORDER BY e.id", args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	list := []employeeRow{}
	for rows.Next() {
		if d, err := scanEmployee(rows, false); err == nil {
			list = append(list, d.employeeRow)
		}
	}
	rows.Close()
	var total, active int
	_ = h.DB.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE status IN ('full_time','probationary')) FROM employees`).Scan(&total, &active)
	respondJSON(w, http.StatusOK, map[string]any{"employees": list, "counts": map[string]int{"total": total, "active": active, "inactive": total - active}})
}

func (h *EmployeeHandler) loadEmployee(ctx context.Context, id int, sensitive bool) (*employeeDetail, error) {
	rows, err := h.DB.Query(ctx, employeeSelect+` WHERE e.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, pgx.ErrNoRows
	}
	d, err := scanEmployee(rows, sensitive)
	return &d, err
}

// Detail returns the full record. Sensitive fields are blank unless the caller may see them.
func (h *EmployeeHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid employee id")
		return
	}
	d, err := h.loadEmployee(r.Context(), id, canSeeSensitiveEmployee(appmw.GetClaims(r).Role))
	if errors.Is(err, pgx.ErrNoRows) {
		respondError(w, http.StatusNotFound, "employee not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employee")
		return
	}
	respondJSON(w, http.StatusOK, d)
}

// ---- create / update -------------------------------------------------------------------------

type employeeInput struct {
	FullName        string  `json:"full_name"`
	Nickname        string  `json:"nickname"`
	MBTI            string  `json:"mbti"`
	Birthday        *string `json:"birthday"`
	NIK             string  `json:"nik"`
	Address         string  `json:"address"`
	PositionID      int     `json:"position_id"`
	LocationID      int     `json:"location_id"`
	HostID          *int    `json:"host_id"`
	Whatsapp        string  `json:"whatsapp"`
	Status          string  `json:"status"`
	JoinDate        *string `json:"join_date"`
	BankHolder      string  `json:"bank_holder"`
	BankName        string  `json:"bank_name"`
	BankAccount     string  `json:"bank_account"`
	EmergencyName   string  `json:"emergency_name"`
	EmergencyNumber string  `json:"emergency_number"`
}

// clean trims and validates; it returns the first problem as text.
func (in *employeeInput) clean() error {
	trim := func(s *string) { *s = strings.TrimSpace(*s) }
	for _, s := range []*string{&in.FullName, &in.Nickname, &in.MBTI, &in.NIK, &in.Address, &in.Whatsapp, &in.Status, &in.BankHolder, &in.BankName, &in.BankAccount, &in.EmergencyName, &in.EmergencyNumber} {
		trim(s)
	}
	in.MBTI = strings.ToUpper(in.MBTI)
	if in.Status == "" {
		in.Status = "full_time"
	}
	var err error
	switch {
	case in.FullName == "" || in.Nickname == "":
		return errors.New("Full Name and Nickname are required")
	case in.PositionID == 0 || in.LocationID == 0:
		return errors.New("Position and Location are required")
	case !employeeStatuses[in.Status]:
		return errors.New("invalid status")
	case in.MBTI != "" && !mbtiTypes[in.MBTI]:
		return errors.New("invalid MBTI type")
	}
	if in.Birthday, err = optDate(in.Birthday); err != nil {
		return err
	}
	if in.JoinDate, err = optDate(in.JoinDate); err != nil {
		return err
	}
	return nil
}

const employeeWriteCols = `full_name=$1, nickname=$2, mbti=$3, birthday=$4::date, position_id=$5, location_id=$6, host_id=$7, whatsapp=$8, status=$9, join_date=$10::date`

func (h *EmployeeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in employeeInput
	if err := decodeJSON(r, &in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := in.clean(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !canSeeSensitiveEmployee(appmw.GetClaims(r).Role) {
		in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber = "", "", "", "", "", "", ""
	}
	var id int
	var code string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO employees (full_name, nickname, mbti, birthday, position_id, location_id, host_id, whatsapp, status, join_date,
		                       nik, address, bank_holder, bank_name, bank_account, emergency_name, emergency_number)
		VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15,$16,$17) RETURNING id, emp_code`,
		in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate,
		in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber).Scan(&id, &code)
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to save employee (check position, location and host)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"id": id, "emp_code": code})
}

func (h *EmployeeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var in employeeInput
	if err != nil || decodeJSON(r, &in) != nil {
		respondError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := in.clean(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	var ct int64
	if canSeeSensitiveEmployee(appmw.GetClaims(r).Role) {
		tag, err := h.DB.Exec(r.Context(), `UPDATE employees SET `+employeeWriteCols+`,
			nik=$11, address=$12, bank_holder=$13, bank_name=$14, bank_account=$15, emergency_name=$16, emergency_number=$17, updated_at=now() WHERE id=$18`,
			in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate,
			in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber, id)
		if err != nil {
			respondError(w, http.StatusBadRequest, "failed to save employee (check position, location and host)")
			return
		}
		ct = tag.RowsAffected()
	} else { // sensitive columns are left exactly as they are
		tag, err := h.DB.Exec(r.Context(), `UPDATE employees SET `+employeeWriteCols+`, updated_at=now() WHERE id=$11`,
			in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate, id)
		if err != nil {
			respondError(w, http.StatusBadRequest, "failed to save employee (check position, location and host)")
			return
		}
		ct = tag.RowsAffected()
	}
	if ct == 0 {
		respondError(w, http.StatusNotFound, "employee not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- Excel export / import --------------------------------------------------------------------

// Export returns every employee with all columns the import understands (sensitive ones only for those who may see them).
func (h *EmployeeHandler) Export(w http.ResponseWriter, r *http.Request) {
	sensitive := canSeeSensitiveEmployee(appmw.GetClaims(r).Role)
	rows, err := h.DB.Query(r.Context(), employeeSelect+` ORDER BY e.id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	defer rows.Close()
	out := []employeeDetail{}
	for rows.Next() {
		if d, err := scanEmployee(rows, sensitive); err == nil {
			out = append(out, d)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

type importEmployeeRow struct {
	employeeInput
	EmpCode  string `json:"emp_code"`
	Position string `json:"position"`
	Location string `json:"location"`
	Host     string `json:"host"`
}

type importError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

// Import creates employees (or updates the ones whose Employee ID matches). Positions are created when new;
// Locations and Hosts must already exist. Nothing is saved when any row is invalid.
func (h *EmployeeHandler) Import(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Rows []importEmployeeRow `json:"rows"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.Rows) == 0 {
		respondError(w, http.StatusBadRequest, "no rows to import")
		return
	}
	if len(req.Rows) > 2000 {
		respondError(w, http.StatusBadRequest, "at most 2000 rows per import")
		return
	}
	ctx := r.Context()
	sensitive := canSeeSensitiveEmployee(appmw.GetClaims(r).Role)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	lookup := func(sql string, name string) (int, bool) {
		var id int
		if tx.QueryRow(ctx, sql, name).Scan(&id) != nil {
			return 0, false
		}
		return id, true
	}
	var errs []importError
	created, updated := 0, 0
	for i, row := range req.Rows {
		line := i + 2 // header is row 1 in the sheet
		in := row.employeeInput
		if pos := strings.TrimSpace(row.Position); pos != "" {
			if err := tx.QueryRow(ctx, `INSERT INTO employee_positions (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, pos).Scan(&in.PositionID); err != nil {
				errs = append(errs, importError{line, "cannot save position " + pos})
				continue
			}
		}
		if loc := strings.TrimSpace(row.Location); loc != "" {
			id, ok := lookup(`SELECT id FROM employee_locations WHERE lower(name) = lower($1) AND is_active = true`, loc)
			if !ok {
				errs = append(errs, importError{line, "unknown Location " + loc})
				continue
			}
			in.LocationID = id
		}
		if host := strings.TrimSpace(row.Host); host != "" {
			id, ok := lookup(`SELECT id FROM hosts WHERE lower(name) = lower($1) ORDER BY is_active DESC LIMIT 1`, host)
			if !ok {
				errs = append(errs, importError{line, "unknown Host " + host})
				continue
			}
			in.HostID = &id
		}
		if err := in.clean(); err != nil {
			errs = append(errs, importError{line, err.Error()})
			continue
		}
		if !sensitive {
			in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber = "", "", "", "", "", "", ""
		}
		code := strings.ToUpper(strings.TrimSpace(row.EmpCode))
		var id int
		if code != "" {
			if tx.QueryRow(ctx, `SELECT id FROM employees WHERE emp_code = $1`, code).Scan(&id) != nil {
				errs = append(errs, importError{line, "unknown Employee ID " + code})
				continue
			}
		}
		if id != 0 {
			q := `UPDATE employees SET ` + employeeWriteCols + `, updated_at=now() WHERE id=$11`
			args := []any{in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate, id}
			if sensitive {
				q = `UPDATE employees SET ` + employeeWriteCols + `, nik=$11, address=$12, bank_holder=$13, bank_name=$14, bank_account=$15, emergency_name=$16, emergency_number=$17, updated_at=now() WHERE id=$18`
				args = []any{in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate,
					in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber, id}
			}
			if _, err := tx.Exec(ctx, q, args...); err != nil {
				errs = append(errs, importError{line, "could not save this row"})
				continue
			}
			updated++
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO employees (full_name, nickname, mbti, birthday, position_id, location_id, host_id, whatsapp, status, join_date,
			                       nik, address, bank_holder, bank_name, bank_account, emergency_name, emergency_number)
			VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15,$16,$17)`,
			in.FullName, in.Nickname, in.MBTI, in.Birthday, in.PositionID, in.LocationID, in.HostID, in.Whatsapp, in.Status, in.JoinDate,
			in.NIK, in.Address, in.BankHolder, in.BankName, in.BankAccount, in.EmergencyName, in.EmergencyNumber); err != nil {
			errs = append(errs, importError{line, "could not save this row"})
			continue
		}
		created++
	}
	if len(errs) > 0 {
		respondJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "some rows are invalid; nothing was imported", "errors": errs})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"created": created, "updated": updated})
}
