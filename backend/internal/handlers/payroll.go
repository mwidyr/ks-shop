package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	appmw "ordermgmt/internal/middleware"
)

// ---- settings ---------------------------------------------------------------------------------

func (h *EmployeeHandler) loadBonusSettings(ctx context.Context) bonusSettings {
	s := bonusSettings{QtyTiers: []qtyTier{}, GMVTiers: []gmvTier{}, Daily: dailyBonusConfig{Tiers: []dailyTier{}}}
	rows, err := h.DB.Query(ctx, `SELECT key, value FROM payroll_settings`)
	if err != nil {
		return s
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var raw []byte
		if rows.Scan(&key, &raw) != nil {
			continue
		}
		switch key {
		case "attendance_bonus":
			var v struct {
				Amount float64 `json:"amount"`
			}
			if json.Unmarshal(raw, &v) == nil {
				s.AttendanceAmount = v.Amount
			}
		case "qty_tiers":
			_ = json.Unmarshal(raw, &s.QtyTiers)
		case "gmv_tiers":
			_ = json.Unmarshal(raw, &s.GMVTiers)
		case "daily_bonus":
			_ = json.Unmarshal(raw, &s.Daily)
		}
	}
	return s
}

// validate checks the four bonus rules and sorts the tiers.
func (s *bonusSettings) validate() string {
	if s.AttendanceAmount < 0 {
		return "the attendance bonus cannot be negative"
	}
	for _, t := range s.QtyTiers {
		if t.Min < 0 || t.Rate < 0 || (t.Max != nil && *t.Max < t.Min) {
			return "QTY tiers need a minimum of 0 or more, a maximum not below the minimum and a rate of 0 or more"
		}
	}
	for _, t := range s.GMVTiers {
		if t.Min <= 0 || t.Bonus < 0 {
			return "GMV tiers need a threshold above 0 and a bonus of 0 or more"
		}
	}
	for _, t := range s.Daily.Tiers {
		if t.Qty <= 0 || t.Bonus < 0 {
			return "daily tiers need a quantity above 0 and a bonus of 0 or more"
		}
	}
	sort.Slice(s.QtyTiers, func(i, j int) bool { return s.QtyTiers[i].Min < s.QtyTiers[j].Min })
	sort.Slice(s.GMVTiers, func(i, j int) bool { return s.GMVTiers[i].Min < s.GMVTiers[j].Min })
	sort.Slice(s.Daily.Tiers, func(i, j int) bool { return s.Daily.Tiers[i].Qty < s.Daily.Tiers[j].Qty })
	return ""
}

func (h *EmployeeHandler) saveSetting(ctx context.Context, key string, v any) error {
	raw, _ := json.Marshal(v)
	_, err := h.DB.Exec(ctx, `INSERT INTO payroll_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, raw)
	return err
}

type salaryRow struct {
	EmployeeID int     `json:"employee_id"`
	EmpCode    string  `json:"emp_code"`
	Nickname   string  `json:"nickname"`
	Location   string  `json:"location"`
	BaseSalary float64 `json:"base_salary"`
}

// PayrollSettings returns the salary list (employees from Employee List, each with the base salary valid for the
// current month) and the four bonus rules.
func (h *EmployeeHandler) PayrollSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	first, _, _ := monthStart("")
	rows, err := h.DB.Query(ctx, `
		SELECT e.id, e.emp_code, e.nickname, l.name,
		       COALESCE((SELECT base_salary FROM employee_base_salaries b WHERE b.employee_id = e.id AND b.effective_month <= $1::date ORDER BY effective_month DESC LIMIT 1), 0)
		FROM employees e JOIN employee_locations l ON l.id = e.location_id
		WHERE e.status IN ('full_time','probationary') ORDER BY l.is_default DESC, l.name, e.id`, first)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load salaries")
		return
	}
	defer rows.Close()
	salaries := []salaryRow{}
	for rows.Next() {
		var s salaryRow
		if rows.Scan(&s.EmployeeID, &s.EmpCode, &s.Nickname, &s.Location, &s.BaseSalary) == nil {
			salaries = append(salaries, s)
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{"salaries": salaries, "bonus": h.loadBonusSettings(ctx), "effective_month": first[:7]})
}

// SaveSalary sets an employee's base salary from the current month on. Earlier months keep the salary they had, and
// months already paid are frozen anyway.
func (h *EmployeeHandler) SaveSalary(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmployeeID int     `json:"employee_id"`
		BaseSalary float64 `json:"base_salary"`
	}
	if err := decodeJSON(r, &req); err != nil || req.EmployeeID == 0 || req.BaseSalary < 0 {
		respondError(w, http.StatusBadRequest, "employee and a base salary of 0 or more are required")
		return
	}
	first, _, _ := monthStart("")
	_, err := h.DB.Exec(r.Context(), `
		INSERT INTO employee_base_salaries (employee_id, effective_month, base_salary) VALUES ($1,$2::date,$3)
		ON CONFLICT (employee_id, effective_month) DO UPDATE SET base_salary = EXCLUDED.base_salary`, req.EmployeeID, first, req.BaseSalary)
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to save the salary (unknown employee?)")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SaveBonusSettings stores all four bonus rules at once; finalized (paid) months are not affected.
func (h *EmployeeHandler) SaveBonusSettings(w http.ResponseWriter, r *http.Request) {
	var s bonusSettings
	if err := decodeJSON(r, &s); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := s.validate(); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	ctx := r.Context()
	for key, v := range map[string]any{
		"attendance_bonus": map[string]float64{"amount": s.AttendanceAmount},
		"qty_tiers":        s.QtyTiers, "gmv_tiers": s.GMVTiers, "daily_bonus": s.Daily,
	} {
		if err := h.saveSetting(ctx, key, v); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save the bonus rules")
			return
		}
	}
	respondJSON(w, http.StatusOK, h.loadBonusSettings(ctx))
}

// ---- engine -----------------------------------------------------------------------------------

type payrollEmp struct {
	ID         int
	EmpCode    string
	Nickname   string
	FullName   string
	Location   string
	LocationID int
	HostID     *int
	HostName   *string
}

type payrollResult struct {
	payrollEmp
	payrollBreakdown
	Paid       bool
	PaidAt     *time.Time
	PaidByName *string
	Finalized  bool
}

// payrollEmployees: employees active in `month` (Full-time / Probationary, already joined) plus anyone who has a payroll record that month.
func (h *EmployeeHandler) payrollEmployees(ctx context.Context, first, nextFirst string) ([]payrollEmp, error) {
	rows, err := h.DB.Query(ctx, `
		SELECT e.id, e.emp_code, e.nickname, e.full_name, l.name, l.id, e.host_id, ho.name
		FROM employees e JOIN employee_locations l ON l.id = e.location_id LEFT JOIN hosts ho ON ho.id = e.host_id
		WHERE (e.join_date IS NULL OR e.join_date < $2::date)
		  AND (e.status IN ('full_time','probationary') OR EXISTS (SELECT 1 FROM payroll_records pr WHERE pr.employee_id = e.id AND pr.month = $1::date))
		ORDER BY l.is_default DESC, l.name, e.id`, first, nextFirst)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []payrollEmp
	for rows.Next() {
		var e payrollEmp
		if err := rows.Scan(&e.ID, &e.EmpCode, &e.Nickname, &e.FullName, &e.Location, &e.LocationID, &e.HostID, &e.HostName); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

// computeMonth builds the payroll of every given employee for one month: a paid month comes back exactly as it was
// frozen, any other month is calculated from the current salary, attendance, Host sales and bonus rules.
func (h *EmployeeHandler) computeMonth(ctx context.Context, first string, start time.Time, emps []payrollEmp) (map[int]*payrollResult, error) {
	out := map[int]*payrollResult{}
	ids := make([]int, 0, len(emps))
	hostIDs := []int{}
	for _, e := range emps {
		out[e.ID] = &payrollResult{payrollEmp: e}
		ids = append(ids, e.ID)
		if e.HostID != nil {
			hostIDs = append(hostIDs, *e.HostID)
		}
	}
	if len(ids) == 0 {
		return out, nil
	}
	nextFirst := start.AddDate(0, 1, 0).Format("2006-01-02")

	type record struct {
		extra    float64
		note     string
		paidAt   *time.Time
		paidBy   *string
		snapshot []byte
	}
	records := map[int]record{}
	rr, err := h.DB.Query(ctx, `SELECT employee_id, extra, extra_note, paid_at, paid_by_name, snapshot FROM payroll_records WHERE month=$1::date AND employee_id = ANY($2)`, first, ids)
	if err != nil {
		return nil, err
	}
	for rr.Next() {
		var id int
		var rec record
		if err := rr.Scan(&id, &rec.extra, &rec.note, &rec.paidAt, &rec.paidBy, &rec.snapshot); err != nil {
			rr.Close()
			return nil, err
		}
		records[id] = rec
	}
	rr.Close()

	base := map[int]float64{}
	br, err := h.DB.Query(ctx, `SELECT DISTINCT ON (employee_id) employee_id, base_salary FROM employee_base_salaries WHERE employee_id = ANY($1) AND effective_month <= $2::date ORDER BY employee_id, effective_month DESC`, ids, first)
	if err != nil {
		return nil, err
	}
	for br.Next() {
		var id int
		var v float64
		if br.Scan(&id, &v) == nil {
			base[id] = v
		}
	}
	br.Close()

	statuses := map[int]attendanceStatus{}
	var def attendanceStatus
	sr, err := h.DB.Query(ctx, `SELECT id, code, name, is_paid, deduct_bonus, bg_color, text_color, is_active, is_default FROM attendance_statuses`)
	if err != nil {
		return nil, err
	}
	for sr.Next() {
		var s attendanceStatus
		if sr.Scan(&s.ID, &s.Code, &s.Name, &s.IsPaid, &s.DeductBonus, &s.BgColor, &s.TextColor, &s.IsActive, &s.IsDefault) == nil {
			statuses[s.ID] = s
			if s.IsDefault {
				def = s
			}
		}
	}
	sr.Close()
	daysInMonth := int(start.AddDate(0, 1, 0).Sub(start).Hours() / 24)
	override := map[int][]int{} // employee -> status ids of the non-default dates
	ar, err := h.DB.Query(ctx, `SELECT employee_id, status_id FROM attendance_records WHERE employee_id = ANY($1) AND work_date >= $2::date AND work_date < $3::date`, ids, first, nextFirst)
	if err != nil {
		return nil, err
	}
	for ar.Next() {
		var id, sid int
		if ar.Scan(&id, &sid) == nil {
			override[id] = append(override[id], sid)
		}
	}
	ar.Close()

	qtyByHost := map[int]int{}
	gmvByHost := map[int]float64{}
	dailyByHost := map[int]map[string]int{}
	if len(hostIDs) > 0 {
		sales, err := h.DB.Query(ctx, `
			SELECT oi.host_id, (o.created_at AT TIME ZONE 'Asia/Jakarta')::date::text, SUM(oi.qty), SUM(oi.qty * oi.price_at_order)
			FROM order_items oi JOIN orders o ON o.id = oi.order_id
			WHERE oi.host_id = ANY($1) AND o.status NOT IN ('cancelled','return')
			  AND (o.created_at AT TIME ZONE 'Asia/Jakarta') >= $2::date AND (o.created_at AT TIME ZONE 'Asia/Jakarta') < $3::date
			GROUP BY 1, 2`, hostIDs, first, nextFirst)
		if err != nil {
			return nil, err
		}
		for sales.Next() {
			var hid, qty int
			var day string
			var gmv float64
			if sales.Scan(&hid, &day, &qty, &gmv) == nil {
				qtyByHost[hid] += qty
				gmvByHost[hid] += gmv
				if dailyByHost[hid] == nil {
					dailyByHost[hid] = map[string]int{}
				}
				dailyByHost[hid][day] += qty
			}
		}
		sales.Close()
	}

	settings := h.loadBonusSettings(ctx)
	for id, res := range out {
		rec, has := records[id]
		if has && rec.paidAt != nil {
			res.Paid, res.PaidAt, res.PaidByName = true, rec.paidAt, rec.paidBy
		}
		if has && rec.snapshot != nil && rec.paidAt != nil {
			if json.Unmarshal(rec.snapshot, &res.payrollBreakdown) == nil {
				res.Finalized = true
				continue
			}
		}
		att := attendanceCounts{}
		count := func(s attendanceStatus, n int) {
			switch s.Code {
			case "W":
				att.Work += n
			case "OFF":
				att.Off += n
			case "LV":
				att.Leave += n
			}
			if !s.IsPaid {
				att.Unpaid += n
			}
			if s.DeductBonus {
				att.DeductBonus = true
			}
		}
		for _, sid := range override[id] {
			count(statuses[sid], 1)
		}
		count(def, daysInMonth-len(override[id]))
		var qty int
		var gmv float64
		var daily map[string]int
		if res.HostID != nil {
			qty, gmv, daily = qtyByHost[*res.HostID], gmvByHost[*res.HostID], dailyByHost[*res.HostID]
		}
		res.payrollBreakdown = computePayroll(base[id], att, qty, gmv, daily, res.HostID != nil, rec.extra, rec.note, settings)
	}
	return out, nil
}

// ---- Payroll page -----------------------------------------------------------------------------

type payrollRowView struct {
	EmployeeID int              `json:"employee_id"`
	EmpCode    string           `json:"emp_code"`
	Nickname   string           `json:"nickname"`
	FullName   string           `json:"full_name"`
	Location   string           `json:"location"`
	Paid       bool             `json:"paid"`
	PaidAt     *string          `json:"paid_at"`
	PaidBy     *string          `json:"paid_by"`
	Finalized  bool             `json:"finalized"`
	Details    payrollBreakdown `json:"details"`
}

func toPayrollRow(res *payrollResult) payrollRowView {
	v := payrollRowView{EmployeeID: res.ID, EmpCode: res.EmpCode, Nickname: res.Nickname, FullName: res.FullName, Location: res.Location,
		Paid: res.Paid, PaidBy: res.PaidByName, Finalized: res.Finalized, Details: res.payrollBreakdown}
	if res.PaidAt != nil {
		s := res.PaidAt.In(reportZone).Format(time.RFC3339)
		v.PaidAt = &s
	}
	return v
}

// Payroll returns the month's table (filtered by Location) and the summary, which always covers every employee.
func (h *EmployeeHandler) Payroll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	first, start, err := monthStart(r.URL.Query().Get("month"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	nextFirst := start.AddDate(0, 1, 0).Format("2006-01-02")
	emps, err := h.payrollEmployees(ctx, first, nextFirst)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	results, err := h.computeMonth(ctx, first, start, emps)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to calculate payroll")
		return
	}
	locFilter, _ := strconv.Atoi(r.URL.Query().Get("location_id"))
	rows := []payrollRowView{}
	total := 0.0
	paid := 0
	for _, e := range emps {
		res := results[e.ID]
		total += res.FinalSalary
		if locFilter != 0 && e.LocationID != locFilter {
			continue
		}
		if res.Paid {
			paid++
		}
		rows = append(rows, toPayrollRow(res))
	}
	var fee float64
	_ = h.DB.QueryRow(ctx, `SELECT transfer_fee FROM payroll_months WHERE month = $1::date`, first).Scan(&fee)
	respondJSON(w, http.StatusOK, map[string]any{
		"month": first[:7], "rows": rows, "locations": h.loadLocations(ctx, true),
		"counts":  map[string]int{"employees": len(rows), "paid": paid, "pending": len(rows) - paid},
		"summary": map[string]float64{"total_salaries": total, "transfer_fee": fee, "grand_total": total + fee},
	})
}

// SaveTransferFee stores the reserved transfer fee of one month (it only affects the Grand Total).
func (h *EmployeeHandler) SaveTransferFee(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Amount < 0 {
		respondError(w, http.StatusBadRequest, "a transfer fee of 0 or more is required")
		return
	}
	first, _, err := monthStart(req.Month)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	_, err = h.DB.Exec(r.Context(), `INSERT INTO payroll_months (month, transfer_fee) VALUES ($1::date,$2) ON CONFLICT (month) DO UPDATE SET transfer_fee = EXCLUDED.transfer_fee`, first, req.Amount)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save the transfer fee")
		return
	}
	respondJSON(w, http.StatusOK, map[string]float64{"transfer_fee": req.Amount})
}

// SaveExtra sets the manual Extra (positive or negative) and its note. A paid month is frozen: un-confirm the payment first.
func (h *EmployeeHandler) SaveExtra(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmployeeID int     `json:"employee_id"`
		Month      string  `json:"month"`
		Extra      float64 `json:"extra"`
		Note       string  `json:"note"`
	}
	if err := decodeJSON(r, &req); err != nil || req.EmployeeID == 0 {
		respondError(w, http.StatusBadRequest, "employee is required")
		return
	}
	first, _, err := monthStart(req.Month)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	ct, err := h.DB.Exec(r.Context(), `
		INSERT INTO payroll_records (employee_id, month, extra, extra_note) VALUES ($1,$2::date,$3,$4)
		ON CONFLICT (employee_id, month) DO UPDATE SET extra = EXCLUDED.extra, extra_note = EXCLUDED.extra_note
		WHERE payroll_records.paid_at IS NULL`, req.EmployeeID, first, req.Extra, strings.TrimSpace(req.Note))
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to save Extra (unknown employee?)")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusConflict, "this month is already paid; un-confirm the payment to change Extra")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SetPaid confirms (or un-confirms) a salary payment. Confirming freezes today's breakdown as the finalized record
// together with the time and the administrator who confirmed it.
func (h *EmployeeHandler) SetPaid(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmployeeID int    `json:"employee_id"`
		Month      string `json:"month"`
		Paid       bool   `json:"paid"`
	}
	if err := decodeJSON(r, &req); err != nil || req.EmployeeID == 0 {
		respondError(w, http.StatusBadRequest, "employee is required")
		return
	}
	first, start, err := monthStart(req.Month)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	if !req.Paid {
		_, err := h.DB.Exec(ctx, `UPDATE payroll_records SET paid_at=NULL, paid_by=NULL, paid_by_name=NULL, snapshot=NULL WHERE employee_id=$1 AND month=$2::date`, req.EmployeeID, first)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update the payment")
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	nextFirst := start.AddDate(0, 1, 0).Format("2006-01-02")
	emps, err := h.payrollEmployees(ctx, first, nextFirst)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	var mine []payrollEmp
	for _, e := range emps {
		if e.ID == req.EmployeeID {
			mine = append(mine, e)
		}
	}
	if len(mine) == 0 {
		respondError(w, http.StatusNotFound, "this employee has no payroll in that month")
		return
	}
	results, err := h.computeMonth(ctx, first, start, mine)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to calculate payroll")
		return
	}
	res := results[req.EmployeeID]
	if res.Finalized {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"}) // already frozen
		return
	}
	snap, _ := json.Marshal(res.payrollBreakdown)
	_, err = h.DB.Exec(ctx, `
		INSERT INTO payroll_records (employee_id, month, extra, extra_note, paid_at, paid_by, paid_by_name, snapshot)
		VALUES ($1,$2::date,$3,$4,now(),$5,$6,$7)
		ON CONFLICT (employee_id, month) DO UPDATE SET paid_at = now(), paid_by = EXCLUDED.paid_by, paid_by_name = EXCLUDED.paid_by_name, snapshot = EXCLUDED.snapshot`,
		req.EmployeeID, first, res.Extra, res.ExtraNote, claims.UserID, claims.Name, snap)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to confirm the payment")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- Bonus Ranking ----------------------------------------------------------------------------

type rankingRow struct {
	Rank       int     `json:"rank"`
	EmployeeID int     `json:"employee_id"`
	Host       string  `json:"host"`
	Location   string  `json:"location"`
	Qty        int     `json:"qty"`
	GMV        float64 `json:"gmv"`
	TotalBonus float64 `json:"total_bonus"`
}

// BonusRanking lists the Hosts (employees linked to a Host) of a month by Total Bonus = QTY + GMV + Daily Bonus.
// Base salary, Attendance Bonus and Extra are not part of it.
func (h *EmployeeHandler) BonusRanking(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	first, start, err := monthStart(r.URL.Query().Get("month"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	nextFirst := start.AddDate(0, 1, 0).Format("2006-01-02")
	all, err := h.payrollEmployees(ctx, first, nextFirst)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load employees")
		return
	}
	locFilter, _ := strconv.Atoi(r.URL.Query().Get("location_id"))
	var emps []payrollEmp
	for _, e := range all {
		if e.HostID != nil && (locFilter == 0 || e.LocationID == locFilter) {
			emps = append(emps, e)
		}
	}
	results, err := h.computeMonth(ctx, first, start, emps)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to calculate bonuses")
		return
	}
	rows := []rankingRow{}
	for _, e := range emps {
		res := results[e.ID]
		name := e.Nickname
		if e.HostName != nil && *e.HostName != "" {
			name = *e.HostName
		}
		rows = append(rows, rankingRow{EmployeeID: e.ID, Host: name, Location: e.Location, Qty: res.Qty, GMV: res.GMV, TotalBonus: res.QtyBonus + res.GMVBonus + res.DailyBonus})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].TotalBonus > rows[j].TotalBonus })
	for i := range rows {
		rows[i].Rank = i + 1
		if i > 0 && rows[i].TotalBonus == rows[i-1].TotalBonus {
			rows[i].Rank = rows[i-1].Rank
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{"month": first[:7], "rows": rows, "locations": h.loadLocations(ctx, true)})
}
