package handlers

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Website Analytics (#147): traffic, sources, product page views and article views read from Google Analytics 4
// through the GA4 Data API with a service account. Everything is configured through the environment:
//
//	GA4_MEASUREMENT_ID          G-XXXXXXXXXX, the tag the storefront loads (public)
//	GA4_PROPERTY_ID             numeric property id the reports are read from
//	GA4_SERVICE_ACCOUNT_JSON    the service account key file contents (or GA4_SERVICE_ACCOUNT_FILE: its path)
//
// Until the property id and key are set the page reports "not connected".

const (
	ga4TokenURL = "https://oauth2.googleapis.com/token"
	ga4APIBase  = "https://analyticsdata.googleapis.com/v1beta"
	ga4Scope    = "https://www.googleapis.com/auth/analytics.readonly"
	ga4CacheTTL = 5 * time.Minute
)

type ga4Client struct {
	PropertyID string
	Email      string
	Key        *rsa.PrivateKey
	TokenURL   string
	APIBase    string
	HTTP       *http.Client

	mu     sync.Mutex
	token  string
	expiry time.Time
}

// ga4FromEnv returns nil when GA4 is not (fully) configured.
func ga4FromEnv() *ga4Client {
	prop := strings.TrimSpace(os.Getenv("GA4_PROPERTY_ID"))
	raw := os.Getenv("GA4_SERVICE_ACCOUNT_JSON")
	if raw == "" {
		if f := os.Getenv("GA4_SERVICE_ACCOUNT_FILE"); f != "" {
			if b, err := os.ReadFile(f); err == nil {
				raw = string(b)
			}
		}
	}
	if prop == "" || raw == "" {
		return nil
	}
	c, err := newGA4Client(prop, []byte(raw))
	if err != nil {
		return nil
	}
	return c
}

func newGA4Client(property string, keyJSON []byte) (*ga4Client, error) {
	var sa struct {
		Email      string `json:"client_email"`
		PrivateKey string `json:"private_key"`
		TokenURI   string `json:"token_uri"`
	}
	if err := json.Unmarshal(keyJSON, &sa); err != nil || sa.Email == "" || sa.PrivateKey == "" {
		return nil, errors.New("invalid service account key")
	}
	block, _ := pem.Decode([]byte(sa.PrivateKey))
	if block == nil {
		return nil, errors.New("invalid private key")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not RSA")
	}
	tokenURL := ga4TokenURL
	if sa.TokenURI != "" {
		tokenURL = sa.TokenURI
	}
	return &ga4Client{PropertyID: property, Email: sa.Email, Key: key, TokenURL: tokenURL, APIBase: ga4APIBase, HTTP: &http.Client{Timeout: 20 * time.Second}}, nil
}

func (c *ga4Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.expiry.Add(-time.Minute)) {
		return c.token, nil
	}
	now := time.Now()
	assertion, err := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": c.Email, "scope": ga4Scope, "aud": c.TokenURL, "iat": now.Unix(), "exp": now.Add(time.Hour).Unix(),
	}).SignedString(c.Key)
	if err != nil {
		return "", err
	}
	form := url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {assertion}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.TokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if res.StatusCode != http.StatusOK || json.Unmarshal(body, &tok) != nil || tok.AccessToken == "" {
		return "", fmt.Errorf("google token endpoint: status %d", res.StatusCode)
	}
	c.token, c.expiry = tok.AccessToken, now.Add(time.Duration(tok.ExpiresIn)*time.Second)
	return c.token, nil
}

type ga4Row struct {
	Dims    []string
	Metrics []float64
}

// run executes one runReport request and flattens the rows.
func (c *ga4Client) run(ctx context.Context, from, to string, dims, metrics []string, orderMetric string, limit int) ([]ga4Row, error) {
	tok, err := c.accessToken(ctx)
	if err != nil {
		return nil, err
	}
	nameList := func(names []string) []map[string]string {
		out := make([]map[string]string, len(names))
		for i, n := range names {
			out[i] = map[string]string{"name": n}
		}
		return out
	}
	req := map[string]interface{}{
		"dateRanges": []map[string]string{{"startDate": from, "endDate": to}},
		"metrics":    nameList(metrics),
		"limit":      limit,
	}
	if len(dims) > 0 {
		req["dimensions"] = nameList(dims)
	}
	if orderMetric != "" {
		req["orderBys"] = []map[string]interface{}{{"metric": map[string]string{"metricName": orderMetric}, "desc": true}}
	}
	payload, _ := json.Marshal(req)
	hreq, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.APIBase+"/properties/"+url.PathEscape(c.PropertyID)+":runReport", bytes.NewReader(payload))
	hreq.Header.Set("Authorization", "Bearer "+tok)
	hreq.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(hreq)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GA4 Data API: status %d", res.StatusCode)
	}
	var out struct {
		Rows []struct {
			DimensionValues []struct{ Value string } `json:"dimensionValues"`
			MetricValues    []struct{ Value string } `json:"metricValues"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	rows := make([]ga4Row, 0, len(out.Rows))
	for _, r := range out.Rows {
		row := ga4Row{}
		for _, d := range r.DimensionValues {
			row.Dims = append(row.Dims, d.Value)
		}
		for _, m := range r.MetricValues {
			f, _ := strconv.ParseFloat(m.Value, 64)
			row.Metrics = append(row.Metrics, f)
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// ---------------------------------------------------------------- report

var (
	productPathRe = regexp.MustCompile(`^(?:/(?:id|en|zh|vi))?/p/(\d+)/?$`)
	articlePathRe = regexp.MustCompile(`^(?:/(?:id|en|zh|vi))?/style/([^/?#]+)/?$`)
)

type ga4Overview struct {
	Users         float64 `json:"users"`
	NewUsers      float64 `json:"new_users"`
	Sessions      float64 `json:"sessions"`
	PageViews     float64 `json:"page_views"`
	AvgSessionSec float64 `json:"avg_session_seconds"`
	EngagementPct float64 `json:"engagement_rate"` // 0..1
}

type ga4Source struct {
	Channel  string  `json:"channel"`
	Sessions float64 `json:"sessions"`
	Users    float64 `json:"users"`
}

type ga4Product struct {
	ProductID int     `json:"product_id"`
	Code      string  `json:"code"` // Product Code (products.sku)
	Name      string  `json:"name"`
	Views     float64 `json:"views"`
}

type ga4Article struct {
	Slug  string  `json:"slug"`
	Title string  `json:"title"`
	Views float64 `json:"views"`
}

type ga4Report struct {
	Configured bool         `json:"configured"`
	Error      string       `json:"error,omitempty"`
	Overview   *ga4Overview `json:"overview,omitempty"`
	Sources    []ga4Source  `json:"sources"`
	Products   []ga4Product `json:"products"`
	Articles   []ga4Article `json:"articles"`
}

// ga4Querier is what the report needs from the database (a pool, or a transaction in tests).
type ga4Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// buildGA4Report runs the three reports and resolves page paths to product codes / article titles.
func buildGA4Report(ctx context.Context, c *ga4Client, db ga4Querier, from, to string) (*ga4Report, error) {
	rep := &ga4Report{Configured: true, Sources: []ga4Source{}, Products: []ga4Product{}, Articles: []ga4Article{}}
	totals, err := c.run(ctx, from, to, nil, []string{"activeUsers", "newUsers", "sessions", "screenPageViews", "averageSessionDuration", "engagementRate"}, "", 1)
	if err != nil {
		return nil, err
	}
	ov := &ga4Overview{}
	if len(totals) > 0 && len(totals[0].Metrics) >= 6 {
		m := totals[0].Metrics
		*ov = ga4Overview{Users: m[0], NewUsers: m[1], Sessions: m[2], PageViews: m[3], AvgSessionSec: m[4], EngagementPct: m[5]}
	}
	rep.Overview = ov

	src, err := c.run(ctx, from, to, []string{"sessionDefaultChannelGroup"}, []string{"sessions", "activeUsers"}, "sessions", 20)
	if err != nil {
		return nil, err
	}
	for _, r := range src {
		if len(r.Dims) == 1 && len(r.Metrics) == 2 {
			rep.Sources = append(rep.Sources, ga4Source{Channel: r.Dims[0], Sessions: r.Metrics[0], Users: r.Metrics[1]})
		}
	}

	pages, err := c.run(ctx, from, to, []string{"pagePath"}, []string{"screenPageViews"}, "screenPageViews", 5000)
	if err != nil {
		return nil, err
	}
	prodViews := map[int]float64{}
	artViews := map[string]float64{}
	for _, r := range pages {
		if len(r.Dims) != 1 || len(r.Metrics) != 1 {
			continue
		}
		path := r.Dims[0]
		if i := strings.IndexAny(path, "?#"); i >= 0 {
			path = path[:i]
		}
		if m := productPathRe.FindStringSubmatch(path); m != nil {
			id, _ := strconv.Atoi(m[1])
			prodViews[id] += r.Metrics[0]
		} else if m := articlePathRe.FindStringSubmatch(path); m != nil {
			slug, _ := url.PathUnescape(m[1])
			artViews[slug] += r.Metrics[0]
		}
	}
	if len(prodViews) > 0 {
		ids := make([]int, 0, len(prodViews))
		for id := range prodViews {
			ids = append(ids, id)
		}
		rows, err := db.Query(ctx, `SELECT id, COALESCE(sku,''), name FROM products WHERE id = ANY($1)`, ids)
		if err == nil {
			for rows.Next() {
				var p ga4Product
				if rows.Scan(&p.ProductID, &p.Code, &p.Name) == nil {
					p.Views = prodViews[p.ProductID]
					rep.Products = append(rep.Products, p)
				}
			}
			rows.Close()
		}
		sort.Slice(rep.Products, func(i, j int) bool {
			if rep.Products[i].Views != rep.Products[j].Views {
				return rep.Products[i].Views > rep.Products[j].Views
			}
			return rep.Products[i].Code < rep.Products[j].Code
		})
	}
	if len(artViews) > 0 {
		slugs := make([]string, 0, len(artViews))
		for s := range artViews {
			slugs = append(slugs, s)
		}
		rows, err := db.Query(ctx, `SELECT slug, COALESCE(NULLIF(title->>'id',''), NULLIF(title->>'en',''), NULLIF(title->>'zh',''), slug) FROM content_pages WHERE slug = ANY($1)`, slugs)
		if err == nil {
			for rows.Next() {
				var a ga4Article
				if rows.Scan(&a.Slug, &a.Title) == nil {
					a.Views = artViews[a.Slug]
					rep.Articles = append(rep.Articles, a)
				}
			}
			rows.Close()
		}
		sort.Slice(rep.Articles, func(i, j int) bool {
			if rep.Articles[i].Views != rep.Articles[j].Views {
				return rep.Articles[i].Views > rep.Articles[j].Views
			}
			return rep.Articles[i].Slug < rep.Articles[j].Slug
		})
	}
	return rep, nil
}

// ---------------------------------------------------------------- handler

type WebsiteAnalyticsHandler struct {
	DB     *pgxpool.Pool
	Client *ga4Client // nil = not connected

	mu    sync.Mutex
	cache map[string]cachedGA4
}

type cachedGA4 struct {
	at  time.Time
	rep *ga4Report
}

func NewWebsiteAnalyticsHandler(db *pgxpool.Pool) *WebsiteAnalyticsHandler {
	return &WebsiteAnalyticsHandler{DB: db, Client: ga4FromEnv(), cache: map[string]cachedGA4{}}
}

const isoDay = "2006-01-02"

// Report serves GET /analytics/website?from=YYYY-MM-DD&to=YYYY-MM-DD (the shared Date Filter range).
func (h *WebsiteAnalyticsHandler) Report(w http.ResponseWriter, r *http.Request) {
	if h.Client == nil {
		respondJSON(w, http.StatusOK, &ga4Report{Configured: false, Sources: []ga4Source{}, Products: []ga4Product{}, Articles: []ga4Article{}})
		return
	}
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	f, err1 := time.Parse(isoDay, from)
	t, err2 := time.Parse(isoDay, to)
	if err1 != nil || err2 != nil || t.Before(f) || t.Sub(f) > 800*24*time.Hour {
		respondError(w, http.StatusBadRequest, "from and to must be dates (YYYY-MM-DD)")
		return
	}
	key := from + "|" + to
	h.mu.Lock()
	if c, ok := h.cache[key]; ok && time.Since(c.at) < ga4CacheTTL {
		h.mu.Unlock()
		respondJSON(w, http.StatusOK, c.rep)
		return
	}
	h.mu.Unlock()
	rep, err := buildGA4Report(r.Context(), h.Client, h.DB, from, to)
	if err != nil {
		// Google's reason (quota, permission, bad property) goes to the log only; the page shows a generic message.
		fmt.Fprintf(os.Stderr, "ga4 report: %v\n", err)
		respondJSON(w, http.StatusOK, &ga4Report{Configured: true, Error: "ga4_unavailable", Sources: []ga4Source{}, Products: []ga4Product{}, Articles: []ga4Article{}})
		return
	}
	h.mu.Lock()
	if len(h.cache) > 200 {
		h.cache = map[string]cachedGA4{}
	}
	h.cache[key] = cachedGA4{at: time.Now(), rep: rep}
	h.mu.Unlock()
	respondJSON(w, http.StatusOK, rep)
}

var gaMeasurementRe = regexp.MustCompile(`^G-[A-Z0-9]{4,20}$`)

// gaMeasurementID is the public GA4 tag id for the storefront ("" = no tracking); malformed values are ignored.
func gaMeasurementID() string {
	id := strings.TrimSpace(os.Getenv("GA4_MEASUREMENT_ID"))
	if gaMeasurementRe.MatchString(id) {
		return id
	}
	return ""
}
