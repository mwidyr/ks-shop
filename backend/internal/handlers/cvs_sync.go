package handlers

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CvsSyncHandler receives the daily 7-ELEVEN / FamilyMart snapshot from the external
// ralulu-store-sync scraper, upserts it into cvs_stores, and records one cvs_sync_runs row per
// chain for the monitoring panel on the Audit Logs page.
//
// Safety rules (the scraper's README makes the same promises):
//   - stores are only ever upserted by (chain_type, store_code), never deleted;
//   - a chain whose crawl was not fully successful carries no stores and leaves cvs_stores alone,
//     but its failure is still recorded so it shows up on the dashboard;
//   - each chain is applied in its own transaction, so one failing chain can't undo the other.
type CvsSyncHandler struct {
	DB    *pgxpool.Pool
	Token string
}

var sessionRe = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

const (
	cvsSyncMaxBody     = 2 << 20 // scraper chunks stay under nginx's default 1 MB; anything bigger is refused here too
	cvsSyncMaxErrors   = 50      // error rows kept per run; error_count keeps the true total
	cvsSyncMaxErrorLen = 300
)

// scraperChains maps the scraper's chain names to cvs_stores.chain_type.
var scraperChains = map[string]string{
	"7eleven":    "cvs_711",
	"familymart": "cvs_familymart",
}

// flexFloat accepts a JSON number, a numeric string ("121.53"), an empty string or null.
type flexFloat struct {
	Val   float64
	Valid bool
}

func (f *flexFloat) UnmarshalJSON(b []byte) error {
	s := strings.Trim(strings.TrimSpace(string(b)), `"`)
	if s == "" || s == "null" {
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return nil // bad coordinates must not block the import of the store itself
	}
	f.Val, f.Valid = v, true
	return nil
}

// flexString accepts a string, a number or null (FamilyMart sends some fields as numbers).
type flexString string

func (f *flexString) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "null" {
		return nil
	}
	if strings.HasPrefix(s, `"`) {
		var v string
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		*f = flexString(strings.TrimSpace(v))
		return nil
	}
	*f = flexString(s)
	return nil
}

type syncStore struct {
	Chain     string     `json:"chain"`
	StoreID   flexString `json:"store_id"`
	Name      flexString `json:"name"`
	Address   flexString `json:"address"`
	City      flexString `json:"city"`
	District  flexString `json:"district"`
	Phone     flexString `json:"phone"`
	Longitude flexFloat  `json:"longitude"`
	Latitude  flexFloat  `json:"latitude"`
}

type syncError struct {
	City  string `json:"city"`
	Area  string `json:"area"`
	Error string `json:"error"`
}

type syncChainSummary struct {
	Status        string      `json:"status"`
	Count         int         `json:"count"`
	PreviousCount *int        `json:"previous_count"`
	Errors        []syncError `json:"errors"`
}

type syncPayload struct {
	// Session ties chunked uploads together: chunk requests carry {session, stores} only, the final
	// commit request carries {session, summary} and no stores. Without a session the whole snapshot
	// is expected in one request (summary + stores).
	Session     string                      `json:"session"`
	GeneratedAt string                      `json:"generated_at"`
	UploadError string                      `json:"upload_error"`
	Stores      []syncStore                 `json:"stores"`
	Summary     map[string]syncChainSummary `json:"summary"`
}

func (h *CvsSyncHandler) authorized(r *http.Request) bool {
	if h.Token == "" {
		return false
	}
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	a, b := sha256.Sum256([]byte(got)), sha256.Sum256([]byte(h.Token))
	return subtle.ConstantTimeCompare(a[:], b[:]) == 1
}

// runStatus derives success / partial / failed for one chain from the scraper's own verdict.
// "partial" = some regions were fetched but others failed, so the snapshot was not applied.
func runStatus(sum syncChainSummary) string {
	switch {
	case sum.Status == "success" && len(sum.Errors) == 0:
		return "success"
	case sum.Count > 0 && len(sum.Errors) > 0:
		return "partial"
	default:
		return "failed"
	}
}

// validateStores returns the first problem found in a chain's stores, or "".
func validateStores(chain string, stores []syncStore) string {
	seen := make(map[string]struct{}, len(stores))
	for i, s := range stores {
		code := string(s.StoreID)
		switch {
		case s.Chain != chain:
			return fmt.Sprintf("store #%d: chain %q does not match %q", i, s.Chain, chain)
		case code == "" || len(code) > 10:
			return fmt.Sprintf("store #%d: invalid store_id %q", i, code)
		case string(s.Name) == "":
			return fmt.Sprintf("store %s: empty name", code)
		}
		if _, dup := seen[code]; dup {
			return fmt.Sprintf("duplicate store_id %s", code)
		}
		seen[code] = struct{}{}
	}
	return ""
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// Import is POST /api/internal/cvs-sync (bearer token, no staff login).
func (h *CvsSyncHandler) Import(w http.ResponseWriter, r *http.Request) {
	if !h.authorized(r) {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, cvsSyncMaxBody)
	var p syncPayload
	if err := decodeJSON(r, &p); err != nil {
		respondError(w, http.StatusBadRequest, "invalid payload: "+err.Error())
		return
	}
	if p.Session != "" && !sessionRe.MatchString(p.Session) {
		respondError(w, http.StatusUnprocessableEntity, "invalid session")
		return
	}
	if len(p.Summary) == 0 {
		if p.Session != "" && len(p.Stores) > 0 {
			h.stageChunk(w, r, p)
			return
		}
		respondError(w, http.StatusUnprocessableEntity, "summary is required")
		return
	}
	if p.Session != "" && len(p.Stores) > 0 {
		respondError(w, http.StatusUnprocessableEntity, "the commit request must not carry stores")
		return
	}
	for name := range p.Summary {
		if _, ok := scraperChains[name]; !ok {
			respondError(w, http.StatusUnprocessableEntity, "unknown chain: "+name)
			return
		}
	}

	byChain := map[string][]syncStore{}
	for _, s := range p.Stores {
		byChain[s.Chain] = append(byChain[s.Chain], s)
	}
	startedAt, _ := time.Parse(time.RFC3339, p.GeneratedAt)

	// Validate everything up front so a bad payload changes nothing at all.
	status := map[string]string{}
	var staged map[string]int
	if p.Session != "" {
		var err error
		if staged, err = h.stagedCounts(r.Context(), p.Session); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to read staged stores")
			return
		}
		for name := range staged {
			if _, ok := p.Summary[name]; !ok {
				respondError(w, http.StatusUnprocessableEntity, "stores staged for chain without summary: "+name)
				return
			}
		}
	}
	for name, sum := range p.Summary {
		status[name] = runStatus(sum)
		stores := byChain[name]
		if p.Session != "" {
			switch {
			case status[name] != "success" && staged[name] > 0:
				respondError(w, http.StatusUnprocessableEntity, name+": stores sent for a chain that did not succeed")
				return
			case status[name] == "success" && staged[name] != sum.Count:
				respondError(w, http.StatusUnprocessableEntity, fmt.Sprintf("%s: %d stores received but the summary says %d (a chunk is missing)", name, staged[name], sum.Count))
				return
			case status[name] == "success" && sum.Count == 0:
				respondError(w, http.StatusUnprocessableEntity, name+": success reported but no stores sent")
				return
			}
			continue
		}
		if status[name] != "success" {
			if len(stores) > 0 {
				respondError(w, http.StatusUnprocessableEntity, name+": stores sent for a chain that did not succeed")
				return
			}
			continue
		}
		if len(stores) == 0 {
			respondError(w, http.StatusUnprocessableEntity, name+": success reported but no stores sent")
			return
		}
		if msg := validateStores(name, stores); msg != "" {
			respondError(w, http.StatusUnprocessableEntity, name+": "+msg)
			return
		}
	}
	for name := range byChain {
		if _, ok := p.Summary[name]; !ok {
			respondError(w, http.StatusUnprocessableEntity, "stores sent for chain without summary: "+name)
			return
		}
	}

	results := map[string]any{}
	for name, sum := range p.Summary {
		applied, err := h.applyChain(r.Context(), name, status[name], sum, byChain[name], p.Session, startedAt, p.UploadError)
		if err != nil {
			// Non-2xx so the scraper records the failure; the transaction rolled back, data is untouched.
			respondError(w, http.StatusInternalServerError, name+": "+err.Error())
			return
		}
		results[name] = map[string]any{"status": status[name], "applied": applied}
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true, "chains": results})
}

func (h *CvsSyncHandler) applyChain(ctx context.Context, name, status string, sum syncChainSummary, stores []syncStore, session string, startedAt time.Time, uploadErr string) (bool, error) {
	chainType := scraperChains[name]
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	// Previous count = last run that actually applied data; fall back to the scraper's own snapshot count.
	var prev *int
	err = tx.QueryRow(ctx, `SELECT store_count FROM cvs_sync_runs WHERE chain_type=$1 AND applied ORDER BY id DESC LIMIT 1`, chainType).Scan(&prev)
	if errors.Is(err, pgx.ErrNoRows) {
		prev = sum.PreviousCount
	} else if err != nil {
		return false, err
	}

	count := sum.Count
	applied := status == "success"
	if applied && session != "" {
		count = sum.Count // equals the staged count, checked before any chain is applied
		if _, err := tx.Exec(ctx, `
			INSERT INTO cvs_stores (chain_type, store_code, store_name, store_addr, store_phone, city, district, longitude, latitude, updated_at, last_seen_at)
			SELECT chain_type, store_code, store_name, store_addr, store_phone, city, district, longitude, latitude, now(), now()
			FROM cvs_sync_staging WHERE session=$1 AND chain_type=$2
			ON CONFLICT (chain_type, store_code) DO UPDATE SET
				store_name=EXCLUDED.store_name, store_addr=EXCLUDED.store_addr, store_phone=EXCLUDED.store_phone,
				city=EXCLUDED.city, district=EXCLUDED.district, longitude=EXCLUDED.longitude, latitude=EXCLUDED.latitude,
				updated_at=now(), last_seen_at=now()`, session, chainType); err != nil {
			return false, err
		}
	} else if applied {
		count = len(stores)
		ids := make([]string, count)
		names, addrs, phones, cities, districts := make([]string, count), make([]string, count), make([]string, count), make([]string, count), make([]string, count)
		lngs, lats := make([]*float64, count), make([]*float64, count)
		for i, s := range stores {
			ids[i] = string(s.StoreID)
			names[i] = clip(string(s.Name), 100)
			addrs[i] = clip(string(s.Address), 200)
			phones[i] = clip(string(s.Phone), 30)
			cities[i] = clip(string(s.City), 20)
			districts[i] = clip(string(s.District), 20)
			if s.Longitude.Valid {
				v := s.Longitude.Val
				lngs[i] = &v
			}
			if s.Latitude.Valid {
				v := s.Latitude.Val
				lats[i] = &v
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO cvs_stores (chain_type, store_code, store_name, store_addr, store_phone, city, district, longitude, latitude, updated_at, last_seen_at)
			SELECT $1, t.code, t.name, t.addr, t.phone, t.city, t.district, t.lng, t.lat, now(), now()
			FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::float8[], $9::float8[])
			     AS t(code, name, addr, phone, city, district, lng, lat)
			ON CONFLICT (chain_type, store_code) DO UPDATE SET
				store_name=EXCLUDED.store_name, store_addr=EXCLUDED.store_addr, store_phone=EXCLUDED.store_phone,
				city=EXCLUDED.city, district=EXCLUDED.district, longitude=EXCLUDED.longitude, latitude=EXCLUDED.latitude,
				updated_at=now(), last_seen_at=now()`,
			chainType, ids, names, addrs, phones, cities, districts, lngs, lats); err != nil {
			return false, err
		}
	}

	if session != "" {
		if _, err := tx.Exec(ctx, `DELETE FROM cvs_sync_staging WHERE session=$1 AND chain_type=$2`, session, chainType); err != nil {
			return false, err
		}
	}

	var pct *float64
	if prev != nil && *prev > 0 {
		v := math.Round(float64(count-*prev)/float64(*prev)*10000) / 100
		pct = &v
	}
	kept := sum.Errors
	if len(kept) > cvsSyncMaxErrors {
		kept = kept[:cvsSyncMaxErrors]
	}
	for i := range kept {
		kept[i].Error = clip(kept[i].Error, cvsSyncMaxErrorLen)
	}
	errJSON, _ := json.Marshal(kept)
	if kept == nil {
		errJSON = []byte("[]")
	}
	var started *time.Time
	if !startedAt.IsZero() {
		started = &startedAt
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO cvs_sync_runs (chain_type, status, applied, started_at, store_count, previous_count, change_pct, error_count, errors, upload_error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		chainType, status, applied, started, count, prev, pct, len(sum.Errors), errJSON, clip(uploadErr, 500)); err != nil {
		return false, err
	}
	return applied, tx.Commit(ctx)
}

type syncRunView struct {
	Status        string          `json:"status"`
	Applied       bool            `json:"applied"`
	ReceivedAt    time.Time       `json:"received_at"`
	StoreCount    int             `json:"store_count"`
	PreviousCount *int            `json:"previous_count"`
	ChangePct     *float64        `json:"change_pct"`
	ErrorCount    int             `json:"error_count"`
	Errors        json.RawMessage `json:"errors"`
	UploadError   string          `json:"upload_error"`
}

type syncChainStatus struct {
	Chain         string       `json:"chain"`
	LastSuccessAt *time.Time   `json:"last_success_at"`
	LastRun       *syncRunView `json:"last_run"`
	StoresInDB    int          `json:"stores_in_db"`
}

// Status is GET /api/cvs-sync/status: per-chain monitoring data for the Audit Logs page.
func (h *CvsSyncHandler) Status(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := []syncChainStatus{}
	for _, name := range []string{"7eleven", "familymart"} {
		chainType := scraperChains[name]
		c := syncChainStatus{Chain: name}
		h.DB.QueryRow(ctx, `SELECT MAX(received_at) FROM cvs_sync_runs WHERE chain_type=$1 AND status='success'`, chainType).Scan(&c.LastSuccessAt)
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_stores WHERE chain_type=$1`, chainType).Scan(&c.StoresInDB)
		var v syncRunView
		err := h.DB.QueryRow(ctx, `
			SELECT status, applied, received_at, store_count, previous_count, change_pct::float8, error_count, errors, upload_error
			FROM cvs_sync_runs WHERE chain_type=$1 ORDER BY id DESC LIMIT 1`, chainType).
			Scan(&v.Status, &v.Applied, &v.ReceivedAt, &v.StoreCount, &v.PreviousCount, &v.ChangePct, &v.ErrorCount, &v.Errors, &v.UploadError)
		if err == nil {
			c.LastRun = &v
		}
		out = append(out, c)
	}
	respondJSON(w, http.StatusOK, map[string]any{"chains": out})
}

// stageChunk handles one chunk request of a chunked upload: it validates the stores and parks them
// in cvs_sync_staging under the session. Re-sending a chunk (e.g. after a retry) just overwrites its rows.
func (h *CvsSyncHandler) stageChunk(w http.ResponseWriter, r *http.Request, p syncPayload) {
	byChain := map[string][]syncStore{}
	for _, s := range p.Stores {
		if _, ok := scraperChains[s.Chain]; !ok {
			respondError(w, http.StatusUnprocessableEntity, "unknown chain: "+s.Chain)
			return
		}
		byChain[s.Chain] = append(byChain[s.Chain], s)
	}
	for name, stores := range byChain {
		if msg := validateStores(name, stores); msg != "" {
			respondError(w, http.StatusUnprocessableEntity, name+": "+msg)
			return
		}
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	// Housekeeping: drop what interrupted runs left behind.
	if _, err := tx.Exec(ctx, `DELETE FROM cvs_sync_staging WHERE created_at < now() - interval '1 day'`); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	for name, stores := range byChain {
		n := len(stores)
		ids, names, addrs, phones, cities, districts := make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n)
		lngs, lats := make([]*float64, n), make([]*float64, n)
		for i, s := range stores {
			ids[i] = string(s.StoreID)
			names[i] = clip(string(s.Name), 100)
			addrs[i] = clip(string(s.Address), 200)
			phones[i] = clip(string(s.Phone), 30)
			cities[i] = clip(string(s.City), 20)
			districts[i] = clip(string(s.District), 20)
			if s.Longitude.Valid {
				v := s.Longitude.Val
				lngs[i] = &v
			}
			if s.Latitude.Valid {
				v := s.Latitude.Val
				lats[i] = &v
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO cvs_sync_staging (session, chain_type, store_code, store_name, store_addr, store_phone, city, district, longitude, latitude)
			SELECT $1, $2, t.code, t.name, t.addr, t.phone, t.city, t.district, t.lng, t.lat
			FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::float8[], $10::float8[])
			     AS t(code, name, addr, phone, city, district, lng, lat)
			ON CONFLICT (session, chain_type, store_code) DO UPDATE SET
				store_name=EXCLUDED.store_name, store_addr=EXCLUDED.store_addr, store_phone=EXCLUDED.store_phone,
				city=EXCLUDED.city, district=EXCLUDED.district, longitude=EXCLUDED.longitude, latitude=EXCLUDED.latitude`,
			p.Session, scraperChains[name], ids, names, addrs, phones, cities, districts, lngs, lats); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to stage stores")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to stage stores")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"ok": true, "staged": len(p.Stores)})
}

// stagedCounts returns, per scraper chain name, how many stores a session has staged.
func (h *CvsSyncHandler) stagedCounts(ctx context.Context, session string) (map[string]int, error) {
	rows, err := h.DB.Query(ctx, `SELECT chain_type, COUNT(*) FROM cvs_sync_staging WHERE session=$1 GROUP BY chain_type`, session)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var chainType string
		var n int
		if err := rows.Scan(&chainType, &n); err != nil {
			return nil, err
		}
		for name, ct := range scraperChains {
			if ct == chainType {
				out[name] = n
			}
		}
	}
	return out, rows.Err()
}
