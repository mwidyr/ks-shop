package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SiteAdminHandler holds the Ralulu Hub endpoints that manage what the customer website shows:
// home modules, WhatsApp / CS settings, public host profiles, style content, product website extras
// and the customer requests the website collects (restock, returns).
type SiteAdminHandler struct {
	DB *pgxpool.Pool
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func nullStr(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.TrimSpace(s)
}

// ---------------------------------------------------------------- home modules

type homeModuleDTO struct {
	Key      string                 `json:"key"`
	Enabled  bool                   `json:"enabled"`
	Position int                    `json:"position"`
	Title    map[string]string      `json:"title"`
	Subtitle map[string]string      `json:"subtitle"`
	Config   map[string]interface{} `json:"config"`
	Count    int                    `json:"count"` // how many items the module would show right now (0 = hidden on the website)
}

// HomeModules serves GET /admin/home-modules.
func (h *SiteAdminHandler) HomeModules(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.DB.Query(ctx, `SELECT key, enabled, position, title, subtitle, config FROM home_modules ORDER BY position, key`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load modules")
		return
	}
	defer rows.Close()
	out := []homeModuleDTO{}
	for rows.Next() {
		var m homeModuleDTO
		if rows.Scan(&m.Key, &m.Enabled, &m.Position, &m.Title, &m.Subtitle, &m.Config) == nil {
			out = append(out, m)
		}
	}
	rows.Close()
	for i := range out {
		out[i].Count = h.moduleCount(ctx, out[i])
	}
	respondJSON(w, http.StatusOK, out)
}

func (h *SiteAdminHandler) moduleCount(ctx context.Context, m homeModuleDTO) int {
	var n int
	days := 7
	if v, ok := m.Config["days"].(float64); ok && v > 0 {
		days = int(v)
	}
	switch m.Key {
	case "live":
		for _, c := range (&SiteHandler{DB: h.DB}).scanHostCards(ctx, hostCardSelect) {
			if c.LiveStatus == "live" || c.LiveStatus == "scheduled" {
				n++
			}
		}
	case "categories":
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL)`).Scan(&n)
	case "best_sellers":
		h.DB.QueryRow(ctx, `SELECT COUNT(DISTINCT v.product_id) FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN product_variants v ON v.id = oi.variant_id WHERE o.status NOT IN ('cancelled','return')`).Scan(&n)
	case "new_in":
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE is_active AND deleted_at IS NULL AND created_at >= now() - make_interval(days => $1)`, days).Scan(&n)
	case "hosts":
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM hosts WHERE is_active AND is_public AND slug IS NOT NULL`).Scan(&n)
	case "topics":
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM content_pages WHERE type='topic' AND is_published`).Scan(&n)
	}
	return n
}

// SaveHomeModules serves PUT /admin/home-modules: order, on/off, titles and limits in one save.
func (h *SiteAdminHandler) SaveHomeModules(w http.ResponseWriter, r *http.Request) {
	var req []homeModuleDTO
	if err := decodeJSON(r, &req); err != nil || len(req) == 0 {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context())
	for i, m := range req {
		if m.Config == nil {
			m.Config = map[string]interface{}{}
		}
		if lim, ok := m.Config["limit"].(float64); ok && (lim < 1 || lim > 30) {
			respondError(w, http.StatusBadRequest, "limit must be 1-30")
			return
		}
		ct, err := tx.Exec(r.Context(), `UPDATE home_modules SET enabled=$2, position=$3, title=$4, subtitle=$5, config=$6 WHERE key=$1`,
			m.Key, m.Enabled, i+1, nonNilMap(m.Title), nonNilMap(m.Subtitle), m.Config)
		if err != nil || ct.RowsAffected() == 0 {
			respondError(w, http.StatusBadRequest, "unknown module "+m.Key)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

// ---------------------------------------------------------------- site settings (WhatsApp, CS, socials, free shipping)

var siteSettingKeys = []string{"whatsapp_number", "line_id", "cs_hours", "cs_hours_note", "social_youtube", "social_instagram", "social_facebook", "social_tiktok", "free_shipping_active", "free_shipping_start", "free_shipping_end"}

// GetSettings serves GET /admin/site-settings.
func (h *SiteAdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{}
	for _, k := range siteSettingKeys {
		out[k] = ""
	}
	// one query for all the keys (this used to be ten, one per key)
	if rows, err := h.DB.Query(r.Context(), `SELECT key, value FROM store_settings WHERE key = ANY($1)`, siteSettingKeys); err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if rows.Scan(&k, &v) == nil {
				out[k] = v
			}
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SaveSettings serves PATCH /admin/site-settings. The WhatsApp number is stored as wa.me digits with
// the country code ("0822-2005-6883" -> "6282220056883").
func (h *SiteAdminHandler) SaveSettings(w http.ResponseWriter, r *http.Request) {
	var req map[string]string
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if v, ok := req["whatsapp_number"]; ok {
		n := NormalizeWhatsAppNumber(v)
		if n != "" && (len(n) < 8 || len(n) > 15) {
			respondError(w, http.StatusBadRequest, "nomor WhatsApp tidak valid")
			return
		}
		req["whatsapp_number"] = n
	}
	if v, ok := req["line_id"]; ok {
		id, valid := normalizeLineID(v)
		if !valid {
			respondError(w, http.StatusBadRequest, "LINE ID tidak valid (contoh: @ohlalashop888)")
			return
		}
		req["line_id"] = id
	}
	for _, d := range []string{"free_shipping_start", "free_shipping_end"} {
		if v := strings.TrimSpace(req[d]); v != "" {
			if _, err := time.Parse("2006-01-02", v); err != nil {
				respondError(w, http.StatusBadRequest, d+" must be yyyy-mm-dd")
				return
			}
		}
	}
	for _, k := range siteSettingKeys {
		v, ok := req[k]
		if !ok {
			continue
		}
		if len(v) > 500 {
			respondError(w, http.StatusBadRequest, k+" is too long")
			return
		}
		if _, err := h.DB.Exec(r.Context(), `INSERT INTO store_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, k, strings.TrimSpace(v)); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save")
			return
		}
	}
	h.GetSettings(w, r)
}

// ---------------------------------------------------------------- website logo (Theme & Appearance)

const siteLogoKey = "site_logo_url"

// validLogoURL accepts "" (no logo: the website shows its text wordmark), an uploaded file path or an
// absolute http(s) URL, and nothing else (no javascript:, data: or protocol-relative values).
func validLogoURL(v string) bool {
	if v == "" {
		return true
	}
	if len(v) > 500 || strings.ContainsAny(v, " \t\r\n\"'<>\\") {
		return false
	}
	return (strings.HasPrefix(v, "/uploads/") && !strings.Contains(v, "..")) || strings.HasPrefix(v, "https://") || strings.HasPrefix(v, "http://")
}

// GetLogo serves GET /admin/theme/logo.
func (h *SiteAdminHandler) GetLogo(w http.ResponseWriter, r *http.Request) {
	url := ""
	h.DB.QueryRow(r.Context(), `SELECT value FROM store_settings WHERE key=$1`, siteLogoKey).Scan(&url)
	respondJSON(w, http.StatusOK, map[string]string{"logo_url": url})
}

// SaveLogo serves PUT /admin/theme/logo {logo_url}; an empty value removes the logo. The logo is
// used by the website header straight away (it is not part of the theme draft/publish flow).
func (h *SiteAdminHandler) SaveLogo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LogoURL string `json:"logo_url"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	url := strings.TrimSpace(req.LogoURL)
	if !validLogoURL(url) {
		respondError(w, http.StatusBadRequest, "logo_url must be an uploaded file or an http(s) address")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `INSERT INTO store_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, siteLogoKey, url); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"logo_url": url})
}

// ---------------------------------------------------------------- host public profiles

type siteHostRow struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPublic   bool   `json:"is_public"`
	LiveStatus string `json:"live_status"`
	Avatar     string `json:"avatar_url"`
	Items      int    `json:"items"`
}

// Hosts serves GET /admin/site-hosts.
func (h *SiteAdminHandler) Hosts(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT h.id, h.name, COALESCE(h.slug,''), h.is_public, 'offline', COALESCE(h.avatar_url,''),
		       (SELECT COUNT(*) FROM host_products hp WHERE hp.host_id = h.id)
		FROM hosts h WHERE h.is_active ORDER BY h.is_public DESC, h.display_order, h.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load hosts")
		return
	}
	defer rows.Close()
	out := []siteHostRow{}
	for rows.Next() {
		var x siteHostRow
		if rows.Scan(&x.ID, &x.Name, &x.Slug, &x.IsPublic, &x.LiveStatus, &x.Avatar, &x.Items) == nil {
			out = append(out, x)
		}
	}
	ids := make([]int32, len(out))
	for i, x := range out {
		ids[i] = int32(x.ID)
	}
	info := loadHostLive(r.Context(), h.DB, ids)
	for i := range out {
		if x := info[out[i].ID]; x != nil {
			out[i].LiveStatus = liveStateAt(time.Now(), x.Rule, x.Ended).Status
		}
	}
	respondJSON(w, http.StatusOK, out)
}

type siteHostProfile struct {
	ID             int             `json:"id"`
	Name           string          `json:"name"`
	Slug           string          `json:"slug"`
	Alias          []string        `json:"alias"`
	AvatarURL      string          `json:"avatar_url"`
	CoverURL       string          `json:"cover_url"`
	Bio            string          `json:"bio"`
	HeightCM       *int            `json:"height_cm"`
	WeightKG       *int            `json:"weight_kg"`
	UsualSize      string          `json:"usual_size"`
	StyleNote      string          `json:"style_note"`
	Favorites      string          `json:"favorites"`
	DisplayOrder   int             `json:"display_order"`
	IsPublic       bool            `json:"is_public"`
	SEOTitle       string          `json:"seo_title"`
	SEODescription string          `json:"seo_description"`
	Blocks         map[string]bool `json:"blocks"`
	SlugLocked     bool            `json:"slug_locked"`
}

type hostRelations struct {
	Products []struct {
		ProductID int    `json:"product_id"`
		Name      string `json:"name,omitempty"`
		Kind      string `json:"kind"`
		WearSize  string `json:"wear_size"`
	} `json:"products"`
	Outfits []struct {
		Title      string `json:"title"`
		Tag        string `json:"tag"`
		VariantIDs []int  `json:"variant_ids"`
	} `json:"outfits"`
	Coupons []struct {
		PromotionID int    `json:"promotion_id"`
		Code        string `json:"code,omitempty"`
		Title       string `json:"title"`
		Subtitle    string `json:"subtitle"`
	} `json:"coupons"`
}

// Host serves GET /admin/site-hosts/{id}: profile + relations.
func (h *SiteAdminHandler) Host(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var p siteHostProfile
	err = h.DB.QueryRow(r.Context(), `
		SELECT id, name, COALESCE(slug,''), alias, COALESCE(avatar_url,''), COALESCE(cover_url,''), COALESCE(bio,''), height_cm, weight_kg,
		       COALESCE(usual_size,''), COALESCE(style_note,''), COALESCE(favorites,''), display_order, is_public,
		       COALESCE(seo_title,''), COALESCE(seo_description,''), blocks
		FROM hosts WHERE id=$1 AND is_active`, id).
		Scan(&p.ID, &p.Name, &p.Slug, &p.Alias, &p.AvatarURL, &p.CoverURL, &p.Bio, &p.HeightCM, &p.WeightKG, &p.UsualSize, &p.StyleNote, &p.Favorites,
			&p.DisplayOrder, &p.IsPublic,
			&p.SEOTitle, &p.SEODescription, &p.Blocks)
	if err != nil {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	p.SlugLocked = p.Slug != ""
	if p.Alias == nil {
		p.Alias = []string{}
	}
	rel := hostRelations{}
	if rows, err := h.DB.Query(r.Context(), `SELECT hp.product_id, p.name, hp.kind, COALESCE(hp.wear_size,'') FROM host_products hp JOIN products p ON p.id = hp.product_id WHERE hp.host_id=$1 ORDER BY hp.kind, hp.sort_order, hp.id`, id); err == nil {
		for rows.Next() {
			var x struct {
				ProductID int    `json:"product_id"`
				Name      string `json:"name,omitempty"`
				Kind      string `json:"kind"`
				WearSize  string `json:"wear_size"`
			}
			if rows.Scan(&x.ProductID, &x.Name, &x.Kind, &x.WearSize) == nil {
				rel.Products = append(rel.Products, x)
			}
		}
		rows.Close()
	}
	if orows, err := h.DB.Query(r.Context(), `SELECT id, title, COALESCE(tag,'') FROM host_outfits WHERE host_id=$1 ORDER BY sort_order, id`, id); err == nil {
		type oid struct {
			id         int
			title, tag string
		}
		var os []oid
		for orows.Next() {
			var o oid
			if orows.Scan(&o.id, &o.title, &o.tag) == nil {
				os = append(os, o)
			}
		}
		orows.Close()
		for _, o := range os {
			ids := h.idsOf(r.Context(), `SELECT variant_id FROM host_outfit_items WHERE outfit_id=$1 ORDER BY sort_order`, o.id)
			rel.Outfits = append(rel.Outfits, struct {
				Title      string `json:"title"`
				Tag        string `json:"tag"`
				VariantIDs []int  `json:"variant_ids"`
			}{o.title, o.tag, ids})
		}
	}
	if rows, err := h.DB.Query(r.Context(), `SELECT hc.promotion_id, COALESCE(p.code,''), COALESCE(hc.title,''), COALESCE(hc.subtitle,'') FROM host_coupons hc JOIN promotions p ON p.id = hc.promotion_id WHERE hc.host_id=$1 ORDER BY hc.sort_order`, id); err == nil {
		for rows.Next() {
			var x struct {
				PromotionID int    `json:"promotion_id"`
				Code        string `json:"code,omitempty"`
				Title       string `json:"title"`
				Subtitle    string `json:"subtitle"`
			}
			if rows.Scan(&x.PromotionID, &x.Code, &x.Title, &x.Subtitle) == nil {
				rel.Coupons = append(rel.Coupons, x)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"profile": p, "relations": rel})
}

func (h *SiteAdminHandler) idsOf(ctx context.Context, sql string, args ...interface{}) []int {
	out := []int{}
	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var v int
		if rows.Scan(&v) == nil {
			out = append(out, v)
		}
	}
	return out
}

// SaveHost serves PUT /admin/site-hosts/{id}: profile + relations in one transaction. The slug is
// fixed once set (changing it would break links in search engines).
func (h *SiteAdminHandler) SaveHost(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Profile   siteHostProfile `json:"profile"`
		Relations *hostRelations  `json:"relations"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p := req.Profile
	ctx := r.Context()
	var curSlug string
	if err := h.DB.QueryRow(ctx, `SELECT COALESCE(slug,'') FROM hosts WHERE id=$1 AND is_active`, id).Scan(&curSlug); err != nil {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	slug := strings.ToLower(strings.TrimSpace(p.Slug))
	if curSlug != "" {
		slug = curSlug // locked
	}
	if p.IsPublic && slug == "" {
		respondError(w, http.StatusBadRequest, "slug wajib diisi sebelum host ditampilkan")
		return
	}
	if slug != "" && (!slugRe.MatchString(slug) || len(slug) > 60) {
		respondError(w, http.StatusBadRequest, "slug hanya huruf kecil, angka, dan tanda hubung")
		return
	}
	if p.Blocks == nil {
		p.Blocks = map[string]bool{}
	}
	alias := []string{}
	for _, a := range p.Alias {
		if a = strings.TrimSpace(a); a != "" {
			alias = append(alias, a)
		}
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
		UPDATE hosts SET slug=NULLIF($2,''), alias=$3, avatar_url=NULLIF($4,''), cover_url=NULLIF($5,''), bio=NULLIF($6,''), height_cm=$7, weight_kg=$8,
		       usual_size=NULLIF($9,''), style_note=NULLIF($10,''), favorites=NULLIF($11,''), display_order=$12, is_public=$13,
		       seo_title=NULLIF($14,''), seo_description=NULLIF($15,''), blocks=$16
		WHERE id=$1`,
		id, slug, alias, p.AvatarURL, p.CoverURL, p.Bio, p.HeightCM, p.WeightKG, p.UsualSize, p.StyleNote, p.Favorites, p.DisplayOrder, p.IsPublic, p.SEOTitle, p.SEODescription, p.Blocks); err != nil {
		if strings.Contains(err.Error(), "idx_hosts_slug") {
			respondError(w, http.StatusConflict, "slug sudah dipakai host lain")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to save host")
		return
	}
	if rel := req.Relations; rel != nil {
		if err := replaceHostRelations(ctx, tx, id, rel); err != nil {
			respondError(w, http.StatusBadRequest, "relasi tidak valid: "+err.Error())
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "slug": slug})
}

func replaceHostRelations(ctx context.Context, tx pgx.Tx, id int, rel *hostRelations) error {
	for _, q := range []string{`DELETE FROM host_products WHERE host_id=$1`, `DELETE FROM host_outfits WHERE host_id=$1`, `DELETE FROM host_coupons WHERE host_id=$1`} {
		if _, err := tx.Exec(ctx, q, id); err != nil {
			return err
		}
	}
	for i, x := range rel.Products {
		kind := x.Kind
		if kind != "showing" && kind != "worn" && kind != "pick" {
			kind = "worn"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO host_products (host_id, product_id, kind, wear_size, sort_order) VALUES ($1,$2,$3,NULLIF($4,''),$5) ON CONFLICT DO NOTHING`, id, x.ProductID, kind, x.WearSize, i); err != nil {
			return err
		}
	}
	for i, o := range rel.Outfits {
		if strings.TrimSpace(o.Title) == "" {
			continue
		}
		var oid int
		if err := tx.QueryRow(ctx, `INSERT INTO host_outfits (host_id, title, tag, sort_order) VALUES ($1,$2,NULLIF($3,''),$4) RETURNING id`, id, o.Title, o.Tag, i).Scan(&oid); err != nil {
			return err
		}
		for j, v := range o.VariantIDs {
			if _, err := tx.Exec(ctx, `INSERT INTO host_outfit_items (outfit_id, variant_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, oid, v, j); err != nil {
				return err
			}
		}
	}
	for i, x := range rel.Coupons {
		if _, err := tx.Exec(ctx, `INSERT INTO host_coupons (host_id, promotion_id, title, subtitle, sort_order) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5) ON CONFLICT DO NOTHING`, id, x.PromotionID, x.Title, x.Subtitle, i); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- style content (topics / articles / host journal)

type contentRow struct {
	ID          int        `json:"id"`
	Type        string     `json:"type"`
	Slug        string     `json:"slug"`
	Lang        string     `json:"lang"`
	Title       string     `json:"title"`
	IsPublished bool       `json:"is_published"`
	IsIndexed   bool       `json:"is_indexed"`
	PublishedAt *time.Time `json:"published_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Author      string     `json:"author"`
}

// contentTitleSQL is the title the list shows: the article's own language first, then any other.
const contentTitleSQL = `COALESCE(NULLIF(c.title->>c.lang,''), NULLIF(c.title->>'id',''), NULLIF(c.title->>'en',''), NULLIF(c.title->>'zh',''), c.slug)`

// contentDateRange turns the list's date filter into a [lo, hi) range on updated_at, in the business
// timezone: "7d" = the last 7 days up to now, "last_month" = the previous CALENDAR month, "custom" =
// from..to (both days inclusive, either may be empty). "all" / unknown = no filter (nil, nil).
func contentDateRange(preset, from, to string, now time.Time) (lo, hi *time.Time) {
	now = now.In(businessTZ)
	day := func(s string) *time.Time {
		t, err := time.ParseInLocation("2006-01-02", s, businessTZ)
		if err != nil {
			return nil
		}
		return &t
	}
	switch preset {
	case "7d":
		l := now.AddDate(0, 0, -7)
		h := now.Add(time.Second)
		return &l, &h
	case "last_month":
		first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, businessTZ)
		l := first.AddDate(0, -1, 0)
		return &l, &first
	case "custom":
		lo = day(from)
		if t := day(to); t != nil {
			e := t.AddDate(0, 0, 1)
			hi = &e
		}
		return lo, hi
	}
	return nil, nil
}

// ContentList serves GET /admin/content. Filters: lang, q (title), date (all|7d|last_month|custom + from/to,
// on the last updated date), sort (updated_desc|updated_asc). With ?page= it answers one page
// {items,total,page,page_size} (10 per page by default); without it, the plain list (max 300) as before.
func (h *SiteAdminHandler) ContentList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := " WHERE 1=1"
	var args []any
	arg := func(v any) string { args = append(args, v); return "$" + strconv.Itoa(len(args)) }
	if lang := q.Get("lang"); lang != "" {
		where += " AND c.lang = " + arg(lang)
	}
	if like := likePattern(q.Get("q")); like != "" {
		where += " AND " + contentTitleSQL + " ILIKE " + arg(like)
	}
	if lo, hi := contentDateRange(q.Get("date"), q.Get("from"), q.Get("to"), time.Now()); lo != nil || hi != nil {
		if lo != nil {
			where += " AND c.updated_at >= " + arg(*lo)
		}
		if hi != nil {
			where += " AND c.updated_at < " + arg(*hi)
		}
	}
	order := pickSort(q.Get("sort"), map[string]string{
		"updated_desc": "c.updated_at DESC, c.id DESC",
		"updated_asc":  "c.updated_at ASC, c.id ASC",
	}, "c.updated_at DESC, c.id DESC")

	paged := isPaged(r)
	pg := parsePage(r, 10, 100)
	total := 0
	limit := " LIMIT 300"
	if paged {
		if err := h.DB.QueryRow(r.Context(), "SELECT COUNT(*) FROM content_pages c"+where, args...).Scan(&total); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load content")
			return
		}
		limit = " LIMIT " + arg(pg.Size) + " OFFSET " + arg(pg.Offset)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.type, c.slug, c.lang, `+contentTitleSQL+`, c.is_published, c.is_indexed, c.published_at, c.updated_at,
		       COALESCE(NULLIF(c.author_name,''), ah.name, '')
		FROM content_pages c LEFT JOIN hosts ah ON ah.id = c.author_host_id`+where+" ORDER BY "+order+limit, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load content")
		return
	}
	defer rows.Close()
	out := []contentRow{}
	for rows.Next() {
		var c contentRow
		if rows.Scan(&c.ID, &c.Type, &c.Slug, &c.Lang, &c.Title, &c.IsPublished, &c.IsIndexed, &c.PublishedAt, &c.UpdatedAt, &c.Author) == nil {
			out = append(out, c)
		}
	}
	if paged {
		respondJSON(w, http.StatusOK, pageResponse(out, total, pg))
		return
	}
	respondJSON(w, http.StatusOK, out)
}

type contentDTO struct {
	ID            int                        `json:"id"`
	Type          string                     `json:"type"`
	Slug          string                     `json:"slug"`
	Lang          string                     `json:"lang"`
	Title         map[string]string          `json:"title"`
	Summary       map[string]string          `json:"summary"`    // plain text of the introduction (previews, meta description)
	IntroHTML     map[string]string          `json:"intro_html"` // the formatted introduction
	Body          map[string]json.RawMessage `json:"body"`
	CategoryLabel map[string]string          `json:"category_label"`
	CoverURL      string                     `json:"cover_url"`
	CoverAlt      map[string]string          `json:"cover_alt"`
	AuthorHostID  *int                       `json:"author_host_id"`
	AuthorName    string                     `json:"author_name"`
	ReadMinutes   *int                       `json:"read_minutes"`
	Tags          []string                   `json:"tags"`
	SEOTitle      map[string]string          `json:"seo_title"`
	SEODesc       map[string]string          `json:"seo_description"`
	Canonical     string                     `json:"canonical_url"`
	IsPublished   bool                       `json:"is_published"`
	IsIndexed     bool                       `json:"is_indexed"`
	IsFeatured    bool                       `json:"is_featured"`
	PublishedAt   *time.Time                 `json:"published_at"`
	ProductIDs    []int                      `json:"product_ids"`
	CategoryIDs   []int                      `json:"category_ids"`
	HostIDs       []int                      `json:"host_ids"`
	// Draft is the unpublished copy of a PUBLISHED article (same shape as this struct), null when there is none.
	Draft        json.RawMessage `json:"draft,omitempty"`
	DraftSavedAt *time.Time      `json:"draft_saved_at,omitempty"`
	UpdatedAt    *time.Time      `json:"updated_at,omitempty"`
}

// ContentGet serves GET /admin/content/{id}.
func (h *SiteAdminHandler) ContentGet(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var c contentDTO
	err = h.DB.QueryRow(r.Context(), `
		SELECT id, type, slug, lang, title, summary, intro_html, body, category_label, COALESCE(cover_url,''), cover_alt, author_host_id, COALESCE(author_name,''), read_minutes, tags,
		       seo_title, seo_description, COALESCE(canonical_url,''), is_published, is_indexed, is_featured, published_at, draft, draft_saved_at, updated_at
		FROM content_pages WHERE id=$1`, id).
		Scan(&c.ID, &c.Type, &c.Slug, &c.Lang, &c.Title, &c.Summary, &c.IntroHTML, &c.Body, &c.CategoryLabel, &c.CoverURL, &c.CoverAlt, &c.AuthorHostID, &c.AuthorName, &c.ReadMinutes, &c.Tags,
			&c.SEOTitle, &c.SEODesc, &c.Canonical, &c.IsPublished, &c.IsIndexed, &c.IsFeatured, &c.PublishedAt, &c.Draft, &c.DraftSavedAt, &c.UpdatedAt)
	if err != nil {
		respondError(w, http.StatusNotFound, "content not found")
		return
	}
	c.ProductIDs = h.idsOf(r.Context(), `SELECT product_id FROM content_page_products WHERE page_id=$1 ORDER BY sort_order`, id)
	c.CategoryIDs = h.idsOf(r.Context(), `SELECT category_id FROM content_page_categories WHERE page_id=$1`, id)
	c.HostIDs = h.idsOf(r.Context(), `SELECT host_id FROM content_page_hosts WHERE page_id=$1`, id)
	respondJSON(w, http.StatusOK, c)
}

var typeSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,39}$`)

func validateContent(c *contentDTO) string {
	if !typeSlugRe.MatchString(c.Type) { // the type must also exist in content_types (checked on save)
		return "tipe konten tidak valid"
	}
	c.Slug = strings.ToLower(strings.TrimSpace(c.Slug))
	if !slugRe.MatchString(c.Slug) || len(c.Slug) > 120 {
		return "slug hanya huruf kecil, angka, dan tanda hubung"
	}
	if c.Lang == "" {
		c.Lang = "id"
	}
	if !validContentLang(c.Lang) {
		return "bahasa artikel tidak valid"
	}
	if strings.TrimSpace(c.Title[c.Lang]) == "" {
		return "judul wajib diisi"
	}
	if c.IsPublished && c.Type == "host_article" && c.AuthorHostID == nil {
		return "pilih host penulis untuk jurnal host"
	}
	if t := c.SEOTitle[c.Lang]; len([]rune(t)) > 70 {
		return "judul SEO maksimal 70 karakter"
	}
	return ""
}

func (h *SiteAdminHandler) saveContent(w http.ResponseWriter, r *http.Request, id int) {
	var c contentDTO
	if err := decodeJSON(r, &c); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	mode := r.URL.Query().Get("mode") // "" = normal save, "draft" = autosave / Save Draft
	if msg := validateContent(&c); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	var typeOK bool
	if err := h.DB.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM content_types WHERE slug=$1)`, c.Type).Scan(&typeOK); err != nil || !typeOK {
		respondError(w, http.StatusBadRequest, "tipe konten tidak valid")
		return
	}
	for _, m := range []*map[string]string{&c.Title, &c.Summary, &c.IntroHTML, &c.CategoryLabel, &c.CoverAlt, &c.SEOTitle, &c.SEODesc} {
		*m = nonNilMap(*m)
	}
	if c.Body == nil {
		c.Body = map[string]json.RawMessage{}
	}
	// one language per article: only its own language's text is kept; blocks are checked + sanitised
	for _, m := range []*map[string]string{&c.Title, &c.Summary, &c.IntroHTML, &c.CategoryLabel, &c.CoverAlt, &c.SEOTitle, &c.SEODesc} {
		(*m) = onlyKey(*m, c.Lang)
	}
	if v, ok := c.IntroHTML[c.Lang]; ok {
		c.IntroHTML[c.Lang] = sanitizeRichHTML(v)
	}
	cleaned, cerr := cleanBodyBlocks(c.Body[c.Lang])
	if cerr != nil {
		respondError(w, http.StatusBadRequest, cerr.Error())
		return
	}
	c.Body = map[string]json.RawMessage{c.Lang: cleaned}
	if c.Tags == nil {
		c.Tags = []string{}
	}
	ctx := r.Context()
	if mode == "draft" {
		if id != 0 {
			var live bool
			if err := h.DB.QueryRow(ctx, `SELECT is_published FROM content_pages WHERE id=$1`, id).Scan(&live); err != nil {
				respondError(w, http.StatusNotFound, "content not found")
				return
			}
			if live { // a published article keeps its live version: the form is stored as its draft
				var taken bool
				_ = h.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM content_pages WHERE slug=$1 AND id<>$2)`, c.Slug, id).Scan(&taken)
				if taken {
					respondError(w, http.StatusConflict, "slug sudah dipakai konten lain")
					return
				}
				c.ID, c.Draft, c.DraftSavedAt, c.UpdatedAt = 0, nil, nil, nil
				snap, _ := json.Marshal(c)
				var at time.Time
				if err := h.DB.QueryRow(ctx, `UPDATE content_pages SET draft=$2, draft_saved_at=now() WHERE id=$1 RETURNING draft_saved_at`, id, snap).Scan(&at); err != nil {
					respondError(w, http.StatusInternalServerError, "failed to save draft")
					return
				}
				respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "saved_as": "draft", "draft_saved_at": at})
				return
			}
		}
		c.IsPublished = false // not live yet: Save Draft keeps it a draft
	}
	if c.IsPublished && c.PublishedAt == nil {
		now := time.Now()
		c.PublishedAt = &now
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if id == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO content_pages (type, slug, lang, title, summary, body, category_label, cover_url, cover_alt, author_host_id, author_name, read_minutes, tags, seo_title, seo_description, canonical_url, is_published, is_indexed, is_featured, published_at, intro_html)
			VALUES ($1,$2,$20,$3,$4,$5,$6,NULLIF($7,''),$8,$9,NULLIF($10,''),$11,$12,$13,$14,NULLIF($15,''),$16,$17,$18,$19,$21) RETURNING id`,
			c.Type, c.Slug, c.Title, c.Summary, c.Body, c.CategoryLabel, c.CoverURL, c.CoverAlt, c.AuthorHostID, c.AuthorName, c.ReadMinutes, c.Tags, c.SEOTitle, c.SEODesc, c.Canonical,
			c.IsPublished, c.IsIndexed, c.IsFeatured, c.PublishedAt, c.Lang, c.IntroHTML).Scan(&id)
	} else {
		var ct int64
		res, e := tx.Exec(ctx, `
			UPDATE content_pages SET type=$2, slug=$3, lang=$21, title=$4, summary=$5, body=$6, category_label=$7, cover_url=NULLIF($8,''), cover_alt=$9, author_host_id=$10, author_name=NULLIF($11,''),
			       read_minutes=$12, tags=$13, seo_title=$14, seo_description=$15, canonical_url=NULLIF($16,''), is_published=$17, is_indexed=$18, is_featured=$19, published_at=$20, intro_html=$22,
			       draft=NULL, draft_saved_at=NULL, updated_at=now()
			WHERE id=$1`,
			id, c.Type, c.Slug, c.Title, c.Summary, c.Body, c.CategoryLabel, c.CoverURL, c.CoverAlt, c.AuthorHostID, c.AuthorName, c.ReadMinutes, c.Tags, c.SEOTitle, c.SEODesc, c.Canonical,
			c.IsPublished, c.IsIndexed, c.IsFeatured, c.PublishedAt, c.Lang, c.IntroHTML)
		err = e
		if e == nil {
			ct = res.RowsAffected()
			if ct == 0 {
				respondError(w, http.StatusNotFound, "content not found")
				return
			}
		}
	}
	if err != nil {
		if strings.Contains(err.Error(), "content_pages_slug_key") {
			respondError(w, http.StatusConflict, "slug sudah dipakai konten lain")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to save content")
		return
	}
	for _, q := range []string{`DELETE FROM content_page_products WHERE page_id=$1`, `DELETE FROM content_page_categories WHERE page_id=$1`, `DELETE FROM content_page_hosts WHERE page_id=$1`} {
		if _, err := tx.Exec(ctx, q, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save relations")
			return
		}
	}
	for i, pid := range c.ProductIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO content_page_products (page_id, product_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, id, pid, i); err != nil {
			respondError(w, http.StatusBadRequest, "produk tidak valid")
			return
		}
	}
	for _, cid := range c.CategoryIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO content_page_categories (page_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, cid); err != nil {
			respondError(w, http.StatusBadRequest, "kategori tidak valid")
			return
		}
	}
	for _, hid := range c.HostIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO content_page_hosts (page_id, host_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, hid); err != nil {
			respondError(w, http.StatusBadRequest, "host tidak valid")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id})
}

// ContentCreate serves POST /admin/content.
func (h *SiteAdminHandler) ContentCreate(w http.ResponseWriter, r *http.Request) {
	h.saveContent(w, r, 0)
}

// ContentUpdate serves PUT /admin/content/{id}.
func (h *SiteAdminHandler) ContentUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	h.saveContent(w, r, id)
}

// ContentDelete serves DELETE /admin/content/{id}.
func (h *SiteAdminHandler) ContentDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM content_pages WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------- product website extras

type productSiteDTO struct {
	LiveCode        string `json:"live_code"`
	VideoURL        string `json:"video_url"`
	VideoPosterURL  string `json:"video_poster_url"`
	CompleteTheLook []int  `json:"complete_the_look"`
	Hosts           []struct {
		HostID   int    `json:"host_id"`
		HostName string `json:"host_name,omitempty"`
		Kind     string `json:"kind"`
		WearSize string `json:"wear_size"`
	} `json:"hosts"`
}

// ProductSite serves GET /admin/product-site/{id}.
func (h *SiteAdminHandler) ProductSite(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var d productSiteDTO
	var looks []int32
	if err := h.DB.QueryRow(r.Context(), `SELECT COALESCE(live_code,''), COALESCE(video_url,''), COALESCE(video_poster_url,''), complete_the_look FROM products WHERE id=$1`, id).
		Scan(&d.LiveCode, &d.VideoURL, &d.VideoPosterURL, &looks); err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	d.CompleteTheLook = []int{}
	for _, v := range looks {
		d.CompleteTheLook = append(d.CompleteTheLook, int(v))
	}
	if rows, err := h.DB.Query(r.Context(), `SELECT hp.host_id, h.name, hp.kind, COALESCE(hp.wear_size,'') FROM host_products hp JOIN hosts h ON h.id = hp.host_id WHERE hp.product_id=$1 ORDER BY h.name`, id); err == nil {
		for rows.Next() {
			var x struct {
				HostID   int    `json:"host_id"`
				HostName string `json:"host_name,omitempty"`
				Kind     string `json:"kind"`
				WearSize string `json:"wear_size"`
			}
			if rows.Scan(&x.HostID, &x.HostName, &x.Kind, &x.WearSize) == nil {
				d.Hosts = append(d.Hosts, x)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, d)
}

var liveCodeRe = regexp.MustCompile(`^[A-Za-z0-9]{1,12}$`)

// SaveProductSite serves PUT /admin/product-site/{id}.
func (h *SiteAdminHandler) SaveProductSite(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var d productSiteDTO
	if err := decodeJSON(r, &d); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	d.LiveCode = strings.ToUpper(strings.TrimPrefix(strings.TrimSpace(d.LiveCode), "#"))
	if d.LiveCode != "" && !liveCodeRe.MatchString(d.LiveCode) {
		respondError(w, http.StatusBadRequest, "kode live hanya huruf/angka (maks. 12)")
		return
	}
	for _, u := range []string{d.VideoURL, d.VideoPosterURL} {
		if u != "" && !strings.HasPrefix(u, "http") && !strings.HasPrefix(u, "/uploads/") {
			respondError(w, http.StatusBadRequest, "link media tidak valid")
			return
		}
	}
	looks := make([]int32, 0, len(d.CompleteTheLook))
	for _, v := range d.CompleteTheLook {
		if v != id && len(looks) < 6 {
			looks = append(looks, int32(v))
		}
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	ct, err := tx.Exec(ctx, `UPDATE products SET live_code=NULLIF($2,''), video_url=NULLIF($3,''), video_poster_url=NULLIF($4,''), complete_the_look=$5 WHERE id=$1`, id, d.LiveCode, d.VideoURL, d.VideoPosterURL, looks)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM host_products WHERE product_id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save hosts")
		return
	}
	for _, x := range d.Hosts {
		kind := x.Kind
		if kind != "showing" && kind != "worn" && kind != "pick" {
			kind = "worn"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO host_products (host_id, product_id, kind, wear_size) VALUES ($1,$2,$3,NULLIF($4,'')) ON CONFLICT DO NOTHING`, x.HostID, id, kind, x.WearSize); err != nil {
			respondError(w, http.StatusBadRequest, "host tidak valid")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------- customer requests from the website

// RestockRequests serves GET /admin/restock-requests.
func (h *SiteAdminHandler) RestockRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT rr.id, p.id, p.name, COALESCE(pv.color,''), COALESCE(pv.size,''), rr.contact, rr.created_at, rr.notified_at
		FROM restock_requests rr JOIN products p ON p.id = rr.product_id LEFT JOIN product_variants pv ON pv.id = rr.variant_id
		ORDER BY rr.created_at DESC LIMIT 200`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load")
		return
	}
	defer rows.Close()
	type row struct {
		ID         int        `json:"id"`
		ProductID  int        `json:"product_id"`
		Product    string     `json:"product"`
		Color      string     `json:"color"`
		Size       string     `json:"size"`
		Contact    string     `json:"contact"`
		CreatedAt  time.Time  `json:"created_at"`
		NotifiedAt *time.Time `json:"notified_at"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if rows.Scan(&x.ID, &x.ProductID, &x.Product, &x.Color, &x.Size, &x.Contact, &x.CreatedAt, &x.NotifiedAt) == nil {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// MarkRestockNotified serves POST /admin/restock-requests/{id}/notified.
func (h *SiteAdminHandler) MarkRestockNotified(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	h.DB.Exec(r.Context(), `UPDATE restock_requests SET notified_at = now() WHERE id=$1`, id)
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// WebReturns serves GET /admin/web-returns.
func (h *SiteAdminHandler) WebReturns(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT wr.id, o.id, o.order_no, c.name, c.phone, wr.kind, wr.reason, COALESCE(wr.note,''), wr.status, wr.return_method, wr.refund_method, wr.created_at
		FROM web_return_requests wr JOIN orders o ON o.id = wr.order_id JOIN customers c ON c.id = o.customer_id
		ORDER BY wr.created_at DESC LIMIT 200`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load")
		return
	}
	defer rows.Close()
	type row struct {
		ID           int       `json:"id"`
		OrderID      int       `json:"order_id"`
		OrderNo      string    `json:"order_no"`
		Customer     string    `json:"customer"`
		Phone        string    `json:"phone"`
		Kind         string    `json:"kind"`
		Reason       string    `json:"reason"`
		Note         string    `json:"note"`
		Status       string    `json:"status"`
		ReturnMethod *string   `json:"return_method"`
		RefundMethod *string   `json:"refund_method"`
		CreatedAt    time.Time `json:"created_at"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if rows.Scan(&x.ID, &x.OrderID, &x.OrderNo, &x.Customer, &x.Phone, &x.Kind, &x.Reason, &x.Note, &x.Status, &x.ReturnMethod, &x.RefundMethod, &x.CreatedAt) == nil {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SetWebReturnStatus serves PATCH /admin/web-returns/{id}. Completing a request the customer wanted back as
// store credit adds the refund (+ the bonus %) to their wallet - once.
func (h *SiteAdminHandler) SetWebReturnStatus(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		Status string `json:"status"`
	}
	if err := decodeJSON(r, &req); err != nil || (req.Status != "new" && req.Status != "processing" && req.Status != "done" && req.Status != "rejected") {
		respondError(w, http.StatusBadRequest, "invalid status")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	var orderID int
	var refund *string
	var itemIDs []int32
	var credited *time.Time
	if err := tx.QueryRow(ctx, `SELECT order_id, refund_method, item_ids, credited_at FROM web_return_requests WHERE id=$1 FOR UPDATE`, id).Scan(&orderID, &refund, &itemIDs, &credited); err != nil {
		respondError(w, http.StatusNotFound, "request not found")
		return
	}
	tx.Exec(ctx, `UPDATE web_return_requests SET status=$2 WHERE id=$1`, id, req.Status)
	credit := 0.0
	if req.Status == "done" && credited == nil && refund != nil && *refund == "credit" {
		var memberID *int
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(o.member_id, (SELECT m.id FROM members m WHERE m.customer_id = o.customer_id LIMIT 1)) FROM orders o WHERE o.id=$1`, orderID).Scan(&memberID)
		if memberID != nil {
			var amount float64
			_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(qty*price_at_order),0) FROM order_items WHERE order_id=$1 AND (cardinality($2::int[])=0 OR id = ANY($2))`, orderID, itemIDs).Scan(&amount)
			mh := &MemberHandler{}
			bonus := mh.rewardSettings(ctx, tx).RefundCreditBonusPct
			credit = amount * (1 + bonus/100)
			if credit > 0 && mh.ledgerAdd(ctx, tx, *memberID, "balance", credit, "return_credit", fmt.Sprintf("return:%d", id), "", &orderID) {
				tx.Exec(ctx, `UPDATE web_return_requests SET credited_at=now() WHERE id=$1`, id)
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"status": req.Status, "credited": credit})
}
