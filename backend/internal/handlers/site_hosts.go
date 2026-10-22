package handlers

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type siteHostCard struct {
	ID            int      `json:"id"`
	Slug          string   `json:"slug"`
	Name          string   `json:"name"`
	Alias         []string `json:"alias,omitempty"`
	AvatarURL     string   `json:"avatar_url"`
	LiveStatus    string   `json:"live_status"` // live | scheduled | offline
	LiveTitle     string   `json:"live_title,omitempty"`
	ViewerCount   *int     `json:"viewer_count,omitempty"`
	NextLiveAt    *string  `json:"next_live_at,omitempty"`
	NextLiveTitle string   `json:"next_live_title,omitempty"`
	ItemCount     int      `json:"item_count"`
	HasReplay     bool     `json:"has_replay"`
	WatchURL      string   `json:"watch_url,omitempty"`
	// WearingImage: photo of what the host is showing now (else a recently sold item) - the "Sedang dipakai" thumbnail.
	WearingImage string `json:"wearing_image,omitempty"`
	// Thumbs: up to three product photos of the host (list view).
	Thumbs []string `json:"thumbs,omitempty"`
}

// hostCardSelect lists public hosts. Status "scheduled" decays to "offline" once the announced
// time is more than 4 hours past (the admin sets status by hand - TikTok has no live-status API).
const hostCardSelect = `
	SELECT h.id, h.slug, h.name, h.alias, COALESCE(h.avatar_url,''),
	       CASE WHEN h.live_status = 'scheduled' AND h.next_live_at IS NOT NULL AND h.next_live_at < now() - interval '4 hours'
	            THEN 'offline' ELSE h.live_status END,
	       COALESCE(h.live_title,''), h.viewer_count, h.next_live_at, COALESCE(h.next_live_title,''),
	       CASE WHEN EXISTS (SELECT 1 FROM host_products hp WHERE hp.host_id = h.id)
	            THEN (SELECT COUNT(DISTINCT hp.product_id) FROM host_products hp WHERE hp.host_id = h.id)
	            ELSE (SELECT COUNT(DISTINCT v.product_id) FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.host_id = h.id) END,
	       EXISTS (SELECT 1 FROM host_replays hr WHERE hr.host_id = h.id),
	       CASE WHEN h.live_url IS NOT NULL AND h.live_url <> '' AND (h.live_url_expires_at IS NULL OR h.live_url_expires_at > now())
	            THEN h.live_url ELSE COALESCE(h.tiktok_url,'') END,
	       COALESCE(
	         (SELECT pi.url FROM host_products hp JOIN product_images pi ON pi.product_id = hp.product_id
	          WHERE hp.host_id = h.id ORDER BY (hp.kind='showing') DESC, hp.sort_order, pi.sort_order LIMIT 1),
	         (SELECT pi.url FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id JOIN product_images pi ON pi.product_id = v.product_id
	          WHERE oi.host_id = h.id ORDER BY oi.id DESC, pi.sort_order LIMIT 1), ''),
	       COALESCE(ARRAY(SELECT x.url FROM (SELECT DISTINCT ON (hp.product_id) pi.url, hp.sort_order AS so, hp.product_id FROM host_products hp JOIN product_images pi ON pi.product_id = hp.product_id
	          WHERE hp.host_id = h.id ORDER BY hp.product_id, pi.sort_order) x ORDER BY x.so, x.product_id LIMIT 3), '{}')
	FROM hosts h WHERE h.is_active AND h.is_public AND h.slug IS NOT NULL AND h.slug <> ''`

func (h *SiteHandler) scanHostCards(ctx context.Context, sql string, args ...interface{}) []siteHostCard {
	out := []siteHostCard{}
	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c siteHostCard
		var next *time.Time
		if rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Alias, &c.AvatarURL, &c.LiveStatus, &c.LiveTitle, &c.ViewerCount, &next,
			&c.NextLiveTitle, &c.ItemCount, &c.HasReplay, &c.WatchURL, &c.WearingImage, &c.Thumbs) != nil {
			continue
		}
		if next != nil {
			s := next.Format(time.RFC3339)
			c.NextLiveAt = &s
		}
		if c.LiveStatus != "live" {
			c.ViewerCount = nil
		}
		out = append(out, c)
	}
	h.applyLiveSchedule(ctx, out, time.Now())
	return out
}

const hostOrder = ` ORDER BY (CASE WHEN h.live_status = 'live' THEN 0 ELSE 1 END), h.display_order, h.name`

// Hosts serves GET /public/store/hosts?q= (A-Z index + live filter data).
func (h *SiteHandler) Hosts(w http.ResponseWriter, r *http.Request) {
	sql := hostCardSelect
	args := []interface{}{}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		sql += ` AND (h.name ILIKE $1 OR h.slug ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(h.alias) a WHERE a ILIKE $1))`
	}
	hosts := h.scanHostCards(r.Context(), sql+hostOrder, args...)
	live := 0
	for _, c := range hosts {
		if c.LiveStatus == "live" {
			live++
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"hosts": hosts, "total": len(hosts), "live_count": live})
}

type siteOutfitItem struct {
	VariantID int     `json:"variant_id"`
	ProductID int     `json:"product_id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	Size      string  `json:"size"`
	Price     float64 `json:"price"`
	Image     string  `json:"image"`
}

type siteOutfit struct {
	ID    int              `json:"id"`
	Title string           `json:"title"`
	Tag   string           `json:"tag,omitempty"`
	Items []siteOutfitItem `json:"items"`
	Total float64          `json:"total"`
}

// wornIDs are the host's worn products: manual rows of the given kinds, else (for "worn") the
// products actually sold through that host's LIVE sessions, newest first.
func (h *SiteHandler) hostProductIDs(ctx context.Context, hostID int, kind string) []int {
	ids := h.idList(ctx, `SELECT product_id FROM host_products WHERE host_id=$1 AND kind=$2 ORDER BY sort_order, id`, hostID, kind)
	if len(ids) == 0 && kind == "worn" {
		ids = h.idList(ctx, `
			SELECT v.product_id FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
			WHERE oi.host_id = $1 GROUP BY v.product_id ORDER BY MAX(oi.id) DESC LIMIT 60`, hostID)
	}
	return ids
}

// Host serves GET /public/store/hosts/{slug}: the host's personal page.
func (h *SiteHandler) Host(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	slug := strings.ToLower(chi.URLParam(r, "slug"))
	lang := siteLang(r)

	var id int
	if err := h.DB.QueryRow(ctx, `SELECT id FROM hosts WHERE lower(slug)=$1 AND is_active AND is_public`, slug).Scan(&id); err != nil {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	cards := h.scanHostCards(ctx, hostCardSelect+` AND h.id=$1`, id)
	if len(cards) == 0 {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	card := cards[0]

	var bio, usual, style, fav, tiktok, cover, seoTitle, seoDesc string
	var height, weight *int
	var blocks map[string]bool
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(bio,''), height_cm, weight_kg, COALESCE(usual_size,''), COALESCE(style_note,''), COALESCE(favorites,''),
		       COALESCE(tiktok_url,''), COALESCE(cover_url,''), COALESCE(seo_title,''), COALESCE(seo_description,''), blocks
		FROM hosts WHERE id=$1`, id).Scan(&bio, &height, &weight, &usual, &style, &fav, &tiktok, &cover, &seoTitle, &seoDesc, &blocks)

	hostInfo := map[string]interface{}{
		"id": card.ID, "slug": card.Slug, "name": card.Name, "avatar_url": card.AvatarURL, "cover_url": cover,
		"live_status": card.LiveStatus, "live_title": card.LiveTitle, "viewer_count": card.ViewerCount,
		"next_live_at": card.NextLiveAt, "next_live_title": card.NextLiveTitle, "watch_url": card.WatchURL,
		"tiktok_url": tiktok, "seo_title": seoTitle, "seo_description": seoDesc,
	}
	// Optional body fields: empty = not shown on the website.
	if bio != "" {
		hostInfo["bio"] = bio
	}
	if height != nil {
		hostInfo["height_cm"] = *height
	}
	if weight != nil {
		hostInfo["weight_kg"] = *weight
	}
	if usual != "" {
		hostInfo["usual_size"] = usual
	}
	if style != "" {
		hostInfo["style_note"] = style
	}
	if fav != "" {
		hostInfo["favorites"] = fav
	}
	if len(card.Alias) > 0 {
		hostInfo["alias"] = card.Alias
	}

	showing := h.cards(ctx, r, h.hostProductIDs(ctx, id, "showing"))
	worn := h.cards(ctx, r, h.hostProductIDs(ctx, id, "worn"))
	picks := h.cards(ctx, r, h.hostProductIDs(ctx, id, "pick"))
	// wear size per product (manual rows)
	sizes := map[int]string{}
	if rows, err := h.DB.Query(ctx, `SELECT product_id, COALESCE(wear_size,'') FROM host_products WHERE host_id=$1 AND wear_size <> ''`, id); err == nil {
		for rows.Next() {
			var pid int
			var s string
			if rows.Scan(&pid, &s) == nil {
				sizes[pid] = s
			}
		}
		rows.Close()
	}
	for _, list := range [][]siteCard{showing, worn, picks} {
		for i := range list {
			list[i].WearSize = sizes[list[i].ID]
		}
	}

	outfits := []siteOutfit{}
	if orows, err := h.DB.Query(ctx, `SELECT id, title, COALESCE(tag,'') FROM host_outfits WHERE host_id=$1 ORDER BY sort_order, id`, id); err == nil {
		for orows.Next() {
			var o siteOutfit
			if orows.Scan(&o.ID, &o.Title, &o.Tag) == nil {
				o.Items = []siteOutfitItem{}
				outfits = append(outfits, o)
			}
		}
		orows.Close()
	}
	for i := range outfits {
		irows, err := h.DB.Query(ctx, `
			SELECT pv.id, p.id, `+productNameSQL(r, "p")+`, `+storeColorSQL(r, "pv.color")+`, pv.size, pv.price,
			       COALESCE((SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order LIMIT 1), '')
			FROM host_outfit_items hi JOIN product_variants pv ON pv.id = hi.variant_id JOIN products p ON p.id = pv.product_id
			WHERE hi.outfit_id=$1 AND pv.is_active AND p.is_active ORDER BY hi.sort_order`, outfits[i].ID)
		if err != nil {
			continue
		}
		for irows.Next() {
			var it siteOutfitItem
			if irows.Scan(&it.VariantID, &it.ProductID, &it.Name, &it.Color, &it.Size, &it.Price, &it.Image) == nil {
				outfits[i].Items = append(outfits[i].Items, it)
				outfits[i].Total += it.Price
			}
		}
		irows.Close()
	}

	type coupon struct {
		Code     string     `json:"code"`
		Title    string     `json:"title"`
		Subtitle string     `json:"subtitle"`
		Type     string     `json:"type"`
		Value    float64    `json:"value"`
		MinOrder float64    `json:"min_order_amount"`
		EndDate  *time.Time `json:"end_date"`
	}
	coupons := []coupon{}
	if crows, err := h.DB.Query(ctx, `
		SELECT COALESCE(p.code,''), COALESCE(hc.title,''), COALESCE(hc.subtitle,''), p.type, p.value, p.min_order_amount, p.end_date
		FROM host_coupons hc JOIN promotions p ON p.id = hc.promotion_id
		WHERE hc.host_id=$1 AND p.is_active AND p.code IS NOT NULL
		  AND (p.start_date IS NULL OR p.start_date <= now()) AND (p.end_date IS NULL OR p.end_date >= now())
		ORDER BY hc.sort_order`, id); err == nil {
		for crows.Next() {
			var c coupon
			if crows.Scan(&c.Code, &c.Title, &c.Subtitle, &c.Type, &c.Value, &c.MinOrder, &c.EndDate) == nil {
				coupons = append(coupons, c)
			}
		}
		crows.Close()
	}

	journal := h.contentCards(ctx, lang, `c.type='host_article' AND c.author_host_id=$1`, []interface{}{id}, 6)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"host": hostInfo, "blocks": blocks, "showing": showing, "worn": worn, "picks": picks,
		"outfits": outfits, "coupons": coupons, "journal": journal,
	})
}

// hostsForProduct: hosts who wore / showed a product (manual relation or via LIVE sales).
func (h *SiteHandler) hostsForProduct(ctx context.Context, productID int) []siteHostCard {
	return h.scanHostCards(ctx, hostCardSelect+` AND (
		EXISTS (SELECT 1 FROM host_products hp WHERE hp.host_id = h.id AND hp.product_id = $1)
		OR EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.host_id = h.id AND v.product_id = $1))`+hostOrder, productID)
}

// Live serves GET /public/store/live: who is LIVE right now (from the schedule) and who is next.
// Nothing else: no replays, viewer counts or product lists. The watch link is the host's saved LIVE URL.
func (h *SiteHandler) Live(w http.ResponseWriter, r *http.Request) {
	hosts := h.scanHostCards(r.Context(), hostCardSelect+hostOrder)
	live, upcoming := []siteHostCard{}, []siteHostCard{}
	for _, c := range hosts {
		switch {
		case c.LiveStatus == "live":
			live = append(live, c)
		case c.NextLiveAt != nil:
			upcoming = append(upcoming, c)
		}
	}
	// RFC 3339 timestamps in one zone sort as text; every card's next_live_at carries the same +08:00 offset
	sort.SliceStable(upcoming, func(i, j int) bool { return *upcoming[i].NextLiveAt < *upcoming[j].NextLiveAt })
	respondJSON(w, http.StatusOK, map[string]interface{}{"live": live, "scheduled": upcoming})
}
