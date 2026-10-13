package handlers

import (
	"net/http"
	"strconv"
	"strings"
)

type siteCategory struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"` // raw products.category value (used in ?category=)
	Display  string         `json:"display"`
	Slug     string         `json:"slug"`
	ParentID *int           `json:"parent_id"`
	CoverURL string         `json:"cover_url"`
	Count    int            `json:"count"`
	Children []siteCategory `json:"children,omitempty"`
}

// categoryTree loads categories that have sellable products (or children that do), as a tree.
func (h *SiteHandler) categoryTree(r *http.Request) []siteCategory {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name, `+storeCategorySQL(r, "c.name")+`, COALESCE(c.slug,''), c.parent_id, COALESCE(c.cover_url,''),
		       (SELECT COUNT(*) FROM products p WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL
		         AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active))
		FROM categories c ORDER BY c.sort_order, c.id`)
	if err != nil {
		return []siteCategory{}
	}
	defer rows.Close()
	all := []siteCategory{}
	for rows.Next() {
		var c siteCategory
		if rows.Scan(&c.ID, &c.Name, &c.Display, &c.Slug, &c.ParentID, &c.CoverURL, &c.Count) == nil {
			all = append(all, c)
		}
	}
	byParent := map[int][]siteCategory{}
	roots := []siteCategory{}
	for _, c := range all {
		if c.ParentID != nil {
			byParent[*c.ParentID] = append(byParent[*c.ParentID], c)
		}
	}
	for _, c := range all {
		if c.ParentID != nil {
			continue
		}
		c.Children = byParent[c.ID]
		sum := c.Count
		for _, ch := range c.Children {
			sum += ch.Count
		}
		if sum > 0 {
			roots = append(roots, c)
		}
	}
	return roots
}

// Categories2 serves GET /public/store/category-tree.
func (h *SiteHandler) CategoryTree(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.categoryTree(r))
}

// Home serves GET /public/store/home. Only ENABLED modules are returned, in the admin's order, and a
// module with nothing to show is left out entirely (the website then closes the gap).
func (h *SiteHandler) Home(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	lang := siteLang(r)
	rows, err := h.DB.Query(ctx, `SELECT key, title, subtitle, config FROM home_modules WHERE enabled ORDER BY position, key`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load home")
		return
	}
	type mod struct {
		Key      string      `json:"key"`
		Title    string      `json:"title"`
		Subtitle string      `json:"subtitle"`
		Data     interface{} `json:"data"`
	}
	type rawMod struct {
		key       string
		title, sb map[string]string
		cfg       map[string]interface{}
	}
	raws := []rawMod{}
	for rows.Next() {
		var m rawMod
		if rows.Scan(&m.key, &m.title, &m.sb, &m.cfg) == nil {
			raws = append(raws, m)
		}
	}
	rows.Close()

	limitOf := func(m rawMod, def int) int {
		if v, ok := m.cfg["limit"].(float64); ok && v > 0 {
			return int(v)
		}
		return def
	}
	daysOf := func(m rawMod, def int) int {
		if v, ok := m.cfg["days"].(float64); ok && v > 0 {
			return int(v)
		}
		return def
	}

	out := []mod{}
	for _, m := range raws {
		var data interface{}
		switch m.key {
		case "live":
			hosts := h.scanHostCards(ctx, hostCardSelect+hostOrder)
			var focus *siteHostCard
			for i := range hosts {
				if hosts[i].LiveStatus == "live" {
					focus = &hosts[i]
					break
				}
			}
			if focus == nil {
				for i := range hosts {
					if hosts[i].LiveStatus == "scheduled" {
						focus = &hosts[i]
						break
					}
				}
			}
			if focus != nil {
				showing := h.cards(ctx, r, h.hostProductIDs(ctx, focus.ID, "showing"))
				if len(showing) > 3 {
					showing = showing[:3]
				}
				var perk float64
				var perkCode string
				h.DB.QueryRow(ctx, `
					SELECT COALESCE(p.code,''), p.value FROM host_coupons hc JOIN promotions p ON p.id = hc.promotion_id
					WHERE hc.host_id=$1 AND p.is_active AND p.type='fixed_amount' AND (p.end_date IS NULL OR p.end_date >= now())
					ORDER BY p.value DESC LIMIT 1`, focus.ID).Scan(&perkCode, &perk)
				data = map[string]interface{}{"host": focus, "products": showing, "coupon": map[string]interface{}{"code": perkCode, "value": perk}}
			}
		case "categories":
			rows, err := h.DB.Query(ctx, `
				SELECT c.id, c.name, `+storeCategorySQL(r, "c.name")+`, COALESCE(c.slug,''), c.parent_id, COALESCE(c.cover_url,''),
				       (SELECT COUNT(*) FROM products p WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL
				         AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active))
				FROM categories c ORDER BY c.show_on_home DESC, c.sort_order, c.id`)
			list := []siteCategory{}
			if err == nil {
				for rows.Next() {
					var c siteCategory
					if rows.Scan(&c.ID, &c.Name, &c.Display, &c.Slug, &c.ParentID, &c.CoverURL, &c.Count) == nil && c.Count > 0 {
						list = append(list, c)
					}
				}
				rows.Close()
			}
			if n := limitOf(m, 6); len(list) > n {
				list = list[:n]
			}
			if len(list) > 0 {
				data = list
			}
		case "best_sellers":
			n, d := limitOf(m, 10), daysOf(m, 7)
			ids := h.idList(ctx, `
				SELECT v.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
				JOIN product_variants v ON v.id = oi.variant_id
				WHERE o.status NOT IN ('cancelled','return') AND o.created_at >= now() - make_interval(days => $1)
				GROUP BY v.product_id ORDER BY SUM(oi.qty) DESC, v.product_id LIMIT $2`, d, n*2)
			cards := h.cards(ctx, r, ids)
			if len(cards) == 0 { // nothing sold recently: fall back to the all-time ranking
				ids = h.idList(ctx, `
					SELECT v.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
					JOIN product_variants v ON v.id = oi.variant_id
					WHERE o.status NOT IN ('cancelled','return') GROUP BY v.product_id ORDER BY SUM(oi.qty) DESC, v.product_id LIMIT $1`, n*2)
				cards = h.cards(ctx, r, ids)
			}
			if len(cards) > n {
				cards = cards[:n]
			}
			if len(cards) > 0 {
				data = cards
			}
		case "new_in":
			n, d := limitOf(m, 8), daysOf(m, 7)
			ids := h.idList(ctx, `
				SELECT id FROM products WHERE is_active AND deleted_at IS NULL AND created_at >= now() - make_interval(days => $1)
				ORDER BY created_at DESC, id DESC LIMIT $2`, d, n)
			if cards := h.cards(ctx, r, ids); len(cards) > 0 {
				data = cards
			}
		case "hosts":
			hosts := h.scanHostCards(ctx, hostCardSelect+hostOrder)
			if n := limitOf(m, 8); len(hosts) > n {
				hosts = hosts[:n]
			}
			if len(hosts) > 0 {
				data = hosts
			}
		case "topics":
			if items := h.contentCards(ctx, lang, `c.type = 'topic'`, nil, limitOf(m, 5)); len(items) > 0 {
				data = items
			}
		}
		if data == nil {
			continue
		}
		out = append(out, mod{Key: m.key, Title: pickLang(m.title, lang), Subtitle: pickLang(m.sb, lang), Data: data})
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"modules": out})
}

// Search serves GET /public/store/search?q=: hosts (name / alias, case-insensitive), products (name,
// SKU, live code, category - plus whatever the matching hosts wore) and articles, in one response.
// When the query matches products, "hosts_for_products" lists the hosts who wore them.
func (h *SiteHandler) Search(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	lang := siteLang(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		respondJSON(w, http.StatusOK, map[string]interface{}{"hosts": []siteHostCard{}, "products": []siteCard{}, "articles": []siteContentCard{}, "hosts_for_products": []siteHostCard{}, "suggestions": []string{}})
		return
	}
	like := "%" + q + "%"

	hosts := h.scanHostCards(ctx, hostCardSelect+` AND (h.name ILIKE $1 OR h.slug ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(h.alias) a WHERE a ILIKE $1))`+hostOrder, like)

	ids := h.idList(ctx, `
		SELECT p.id FROM products p
		WHERE p.is_active AND p.deleted_at IS NULL
		  AND (p.name ILIKE $1 OR p.names_search ILIKE $1 OR p.sku ILIKE $1 OR p.live_code ILIKE $1 OR p.category ILIKE $1)
		ORDER BY p.id DESC LIMIT 48`, like)
	// products the matching hosts wore (so searching "RARA" finds her clothes)
	seen := map[int]bool{}
	wornIDs := []int{}
	for _, id := range ids {
		seen[id] = true
	}
	for hi, hc := range hosts {
		for _, id := range h.hostProductIDs(ctx, hc.ID, "worn") {
			if hi == 0 {
				wornIDs = append(wornIDs, id)
			}
			if !seen[id] && len(ids) < 80 {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	products := h.cards(ctx, r, ids)
	// what the first matching host is showing in her live right now / lately (the "Sedang ditampilkan" strip)
	liveProducts := []siteCard{}
	if len(hosts) > 0 {
		liveProducts = h.cards(ctx, r, h.hostProductIDs(ctx, hosts[0].ID, "live"))
	}

	articles := h.contentCards(ctx, lang, `(c.title::text ILIKE $1 OR c.summary::text ILIKE $1 OR $2 = ANY(c.tags))`, []interface{}{like, q}, 8)

	hostsFor := []siteHostCard{}
	if len(products) > 0 && len(hosts) == 0 {
		pids := make([]int32, 0, 12)
		for i, p := range products {
			if i >= 12 {
				break
			}
			pids = append(pids, int32(p.ID))
		}
		hostsFor = h.scanHostCards(ctx, hostCardSelect+` AND (
			EXISTS (SELECT 1 FROM host_products hp WHERE hp.host_id = h.id AND hp.product_id = ANY($1))
			OR EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.host_id = h.id AND v.product_id = ANY($1)))`+hostOrder, pids)
	}

	sugg := []string{}
	for _, hc := range hosts {
		if len(sugg) < 3 {
			sugg = append(sugg, hc.Name)
		}
	}
	for _, p := range products {
		if len(sugg) < 6 {
			sugg = append(sugg, p.Name)
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"hosts": hosts, "products": products, "articles": articles, "hosts_for_products": hostsFor, "suggestions": sugg,
		"live_products": liveProducts, "worn_ids": wornIDs,
	})
}

// Cards serves GET /public/store/cards?ids=1,2,3 (favourites / cart look-ups: current price + stock).
func (h *SiteHandler) Cards(w http.ResponseWriter, r *http.Request) {
	ids := []int{}
	for _, part := range strings.Split(r.URL.Query().Get("ids"), ",") {
		if id, err := strconv.Atoi(strings.TrimSpace(part)); err == nil && id > 0 && len(ids) < 40 {
			ids = append(ids, id)
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"items": h.cards(r.Context(), r, ids)})
}
