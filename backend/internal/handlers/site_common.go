package handlers

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SiteHandler serves the extra public endpoints of the ralulu website rebuild (home modules, hosts,
// live, style content, search, store search, coupons, returns, WhatsApp hand-off, theme). It sits
// next to StorefrontHandler (catalog + guest checkout) and follows the same rules: read-only
// public data, never anything staff-only, localized like the admin through X-Lang.
type SiteHandler struct {
	DB *pgxpool.Pool
}

var siteLangs = []string{"id", "en", "zh"}

// siteLang is the website UI language (id default) from ?lang= or the X-Lang header.
func siteLang(r *http.Request) string {
	l := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("lang")))
	if l == "" {
		l = strings.ToLower(strings.TrimSpace(r.Header.Get("X-Lang")))
	}
	for _, s := range siteLangs {
		if l == s {
			return s
		}
	}
	return "id"
}

// pickLang resolves a {"id":..,"en":..,"zh":..} value for lang, falling back id -> en -> zh -> any.
func pickLang(m map[string]string, lang string) string {
	for _, l := range []string{lang, "id", "en", "zh"} {
		if v := strings.TrimSpace(m[l]); v != "" {
			return v
		}
	}
	for _, v := range m {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (h *SiteHandler) setting(ctx context.Context, key, def string) string {
	var v string
	if err := h.DB.QueryRow(ctx, `SELECT value FROM store_settings WHERE key=$1`, key).Scan(&v); err != nil || v == "" {
		return def
	}
	return v
}

var nonDigit = regexp.MustCompile(`\D+`)

// NormalizeWhatsAppNumber turns a typed number into wa.me digits with the country code:
// "0822-2005-6883" -> "6282220056883"; numbers that already start with a country code are kept.
// Taiwan (+886) and Indonesia (+62) are the two markets of the business.
func NormalizeWhatsAppNumber(raw string) string {
	d := nonDigit.ReplaceAllString(raw, "")
	switch {
	case d == "":
		return ""
	case strings.HasPrefix(d, "00"):
		return d[2:]
	case strings.HasPrefix(d, "0"):
		return "62" + d[1:]
	}
	return d
}

// ---- product cards shared by home / hosts / search / content ----

type siteCard struct {
	ID        int     `json:"id"`
	SKU       string  `json:"sku"`
	Name      string  `json:"name"`
	Category  string  `json:"category"`
	LiveCode  string  `json:"live_code,omitempty"`
	Price     float64 `json:"price"`
	CompareAt float64 `json:"compare_at"`
	Image     string  `json:"image"`
	InStock   bool    `json:"in_stock"`
	StockLeft int     `json:"stock_left"`
	IsLive    bool    `json:"is_live"`
	IsNew     bool    `json:"is_new"`
	Sold      int     `json:"sold"`
	WearSize  string  `json:"wear_size,omitempty"`
	CreatedAt string  `json:"created_at"`
}

// cards loads product cards for ids, keeping the given order and dropping inactive products.
func (h *SiteHandler) cards(ctx context.Context, r *http.Request, ids []int) []siteCard {
	out := []siteCard{}
	if len(ids) == 0 {
		return out
	}
	ids32 := make([]int32, len(ids))
	for i, v := range ids {
		ids32[i] = int32(v)
	}
	rows, err := h.DB.Query(ctx, `
		SELECT p.id, COALESCE(p.sku,''), `+productNameSQL(r, "p")+`, `+storeCategorySQL(r, "COALESCE(p.category,'')")+`,
		       COALESCE(p.live_code,''), p.created_at,
		       COALESCE((SELECT MIN(v.price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active), 0),
		       COALESCE((SELECT v.compare_at_price FROM product_variants v WHERE v.product_id = p.id AND v.is_active ORDER BY v.price LIMIT 1), 0),
		       COALESCE((SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order LIMIT 1), ''),
		       COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
		                 JOIN orders o ON o.id = oi.order_id
		                 WHERE v.product_id = p.id AND o.status NOT IN ('cancelled','return')), 0),
		       EXISTS (SELECT 1 FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		               WHERE pv.product_id = p.id AND pv.is_active AND `+sellableSQL+` > 0),
		       COALESCE((SELECT SUM(GREATEST(`+sellableSQL+`, 0))::int FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		                 WHERE pv.product_id = p.id AND pv.is_active), 0)
		FROM products p
		WHERE p.id = ANY($1) AND p.is_active AND p.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
		ORDER BY array_position($1, p.id)`, ids32)
	if err != nil {
		return out
	}
	defer rows.Close()
	weekAgo := time.Now().AddDate(0, 0, -7)
	for rows.Next() {
		var c siteCard
		var created time.Time
		if rows.Scan(&c.ID, &c.SKU, &c.Name, &c.Category, &c.LiveCode, &created, &c.Price, &c.CompareAt, &c.Image, &c.Sold, &c.InStock, &c.StockLeft) != nil {
			continue
		}
		c.CreatedAt = created.Format(time.RFC3339)
		c.IsNew = created.After(weekAgo)
		c.IsLive = c.LiveCode != ""
		if c.CompareAt <= c.Price {
			c.CompareAt = 0
		}
		out = append(out, c)
	}
	return out
}

// idList runs a query that returns one int per row.
func (h *SiteHandler) idList(ctx context.Context, sql string, args ...interface{}) []int {
	ids := []int{}
	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return ids
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// ---- tiny per-IP rate limiter for the public lookup endpoints ----

type rateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var siteLimiter = &rateLimiter{hits: map[string][]time.Time{}}

// allow reports whether key may make another call: at most n calls per window.
func (l *rateLimiter) allow(key string, n int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-window)
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= n {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}

func clientIP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	return host
}

func atoiDefault(s string, def int) int {
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		return v
	}
	return def
}
