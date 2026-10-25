package handlers

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Homepage banners (#144), featured categories (#145) and the category page layout (#146).

const (
	maxHomeBanners    = 20
	maxLayoutSections = 30
	layoutSlotCount   = 5 // per section: slot 0 is the large card of the large templates
)

var layoutTemplates = map[string]bool{"large_left": true, "large_right": true, "all_small": true}

var imageURLRe = regexp.MustCompile(`^(/uploads/[^\s"'<>\\]+|https?://[^\s"'<>\\]+)$`)

// validImageURL: an uploaded file ("/uploads/..", what /uploads/image returns) or an absolute http(s) address.
func validImageURL(v string) bool { return len(v) <= 500 && imageURLRe.MatchString(v) }

// validBannerLink: empty (the banner is not clickable), an internal page ("/p/12", "/products?sort=newest") or an
// external http(s) address. Anything else (javascript:, data:, "//host") is refused.
func validBannerLink(v string) bool {
	if v == "" {
		return true
	}
	if len(v) > 500 || strings.ContainsAny(v, " \t\r\n\"'<>\\") {
		return false
	}
	if strings.HasPrefix(v, "/") {
		return !strings.HasPrefix(v, "//")
	}
	return strings.HasPrefix(v, "https://") || strings.HasPrefix(v, "http://")
}

// ---------------------------------------------------------------- homepage banners (admin)

type homeBannerDTO struct {
	ID       int    `json:"id,omitempty"`
	ImageURL string `json:"image_url"`
	LinkURL  string `json:"link_url"`
	Alt      string `json:"alt"`
	IsActive bool   `json:"is_active"`
}

// HomeBanners serves GET /admin/home-banners: every banner in display order.
func (h *SiteAdminHandler) HomeBanners(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT id, image_url, link_url, alt, is_active FROM home_banners ORDER BY sort_order, id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load banners")
		return
	}
	defer rows.Close()
	out := []homeBannerDTO{}
	for rows.Next() {
		var b homeBannerDTO
		if rows.Scan(&b.ID, &b.ImageURL, &b.LinkURL, &b.Alt, &b.IsActive) == nil {
			out = append(out, b)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SaveHomeBanners serves PUT /admin/home-banners: the whole list in its new order (add, edit, delete and reorder in one save).
func (h *SiteAdminHandler) SaveHomeBanners(w http.ResponseWriter, r *http.Request) {
	var req []homeBannerDTO
	if err := decodeJSON(r, &req); err != nil || len(req) > maxHomeBanners {
		respondError(w, http.StatusBadRequest, "invalid request body (at most "+strconv.Itoa(maxHomeBanners)+" banners)")
		return
	}
	for i := range req {
		b := &req[i]
		b.ImageURL, b.LinkURL, b.Alt = strings.TrimSpace(b.ImageURL), strings.TrimSpace(b.LinkURL), strings.TrimSpace(b.Alt)
		switch {
		case !validImageURL(b.ImageURL):
			respondError(w, http.StatusBadRequest, "banner "+strconv.Itoa(i+1)+": upload an image first")
			return
		case !validBannerLink(b.LinkURL):
			respondError(w, http.StatusBadRequest, "banner "+strconv.Itoa(i+1)+": the link must start with / (a page of the website) or https://")
			return
		case len([]rune(b.Alt)) > 150:
			respondError(w, http.StatusBadRequest, "banner "+strconv.Itoa(i+1)+": the description is too long")
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
	if _, err := tx.Exec(ctx, `DELETE FROM home_banners`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	for i, b := range req {
		if _, err := tx.Exec(ctx, `INSERT INTO home_banners (image_url, link_url, alt, is_active, sort_order) VALUES ($1,$2,$3,$4,$5)`,
			b.ImageURL, b.LinkURL, b.Alt, b.IsActive, i+1); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	h.HomeBanners(w, r)
}

// ---------------------------------------------------------------- category layout (admin)

type layoutSectionDTO struct {
	Template string `json:"template"`
	Slots    []*int `json:"slots"` // layoutSlotCount entries, null = empty slot
}

type layoutCategoryDTO struct {
	ID       int    `json:"id"`
	Name     string `json:"name"` // raw value of products.category (translate with the category master)
	CoverURL string `json:"cover_url"`
	Count    int    `json:"count"` // sellable products; a category without any is not shown on the website
}

// CategoryLayout serves GET /admin/category-layout: the saved sections and every category to choose from.
func (h *SiteAdminHandler) CategoryLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sections := []layoutSectionDTO{}
	idx := map[int]int{}
	if rows, err := h.DB.Query(ctx, `SELECT id, template FROM category_layout_sections ORDER BY sort_order, id`); err == nil {
		for rows.Next() {
			var id int
			var s layoutSectionDTO
			if rows.Scan(&id, &s.Template) == nil {
				s.Slots = make([]*int, layoutSlotCount)
				idx[id] = len(sections)
				sections = append(sections, s)
			}
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `SELECT section_id, slot, category_id FROM category_layout_slots`); err == nil {
		for rows.Next() {
			var sid, slot, cid int
			if rows.Scan(&sid, &slot, &cid) == nil {
				if i, ok := idx[sid]; ok && slot >= 0 && slot < layoutSlotCount {
					c := cid
					sections[i].Slots[slot] = &c
				}
			}
		}
		rows.Close()
	}
	cats := []layoutCategoryDTO{}
	if rows, err := h.DB.Query(ctx, `SELECT c.id, c.name, `+categoryCoverSQL+`, `+categorySellableCountSQL+` FROM categories c ORDER BY c.sort_order, c.name`); err == nil {
		for rows.Next() {
			var c layoutCategoryDTO
			if rows.Scan(&c.ID, &c.Name, &c.CoverURL, &c.Count) == nil {
				cats = append(cats, c)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"sections": sections, "categories": cats})
}

// SaveCategoryLayout serves PUT /admin/category-layout: all sections in their new order (add, delete, reorder, template and
// slot changes in one save). An empty list removes the custom layout; the website then builds a default one.
func (h *SiteAdminHandler) SaveCategoryLayout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Sections []layoutSectionDTO `json:"sections"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.Sections) > maxLayoutSections {
		respondError(w, http.StatusBadRequest, "invalid request body (at most "+strconv.Itoa(maxLayoutSections)+" sections)")
		return
	}
	ctx := r.Context()
	known := map[int]bool{}
	if rows, err := h.DB.Query(ctx, `SELECT id FROM categories`); err == nil {
		for rows.Next() {
			var id int
			if rows.Scan(&id) == nil {
				known[id] = true
			}
		}
		rows.Close()
	}
	for i, s := range req.Sections {
		if !layoutTemplates[s.Template] || len(s.Slots) > layoutSlotCount {
			respondError(w, http.StatusBadRequest, "section "+strconv.Itoa(i+1)+": unknown layout")
			return
		}
		for _, c := range s.Slots {
			if c != nil && !known[*c] {
				respondError(w, http.StatusBadRequest, "section "+strconv.Itoa(i+1)+": unknown category")
				return
			}
		}
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM category_layout_sections`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	for i, s := range req.Sections {
		var sid int
		if err := tx.QueryRow(ctx, `INSERT INTO category_layout_sections (template, sort_order) VALUES ($1,$2) RETURNING id`, s.Template, i+1).Scan(&sid); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save")
			return
		}
		for slot, c := range s.Slots {
			if c == nil {
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO category_layout_slots (section_id, slot, category_id) VALUES ($1,$2,$3)`, sid, slot, *c); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to save")
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	h.CategoryLayout(w, r)
}

// SetCategoryCover serves PATCH /admin/categories/{id}/cover: the image of the category's card (an uploaded file).
// An empty cover_url goes back to the automatic image (a recent product of the category).
func (h *SiteAdminHandler) SetCategoryCover(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		CoverURL string `json:"cover_url"`
	}
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	url := strings.TrimSpace(req.CoverURL)
	if url != "" && !validImageURL(url) {
		respondError(w, http.StatusBadRequest, "invalid image")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE categories SET cover_url=NULLIF($2,'') WHERE id=$1`, id, url)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "category not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"cover_url": url})
}

// ---------------------------------------------------------------- website (public)

// SQL pieces over `categories c`: the card image (own cover, else the photo of a recent product) and how many sellable products.
const categoryCoverSQL = `COALESCE(NULLIF(c.cover_url,''),
	(SELECT pi.url FROM products p JOIN product_images pi ON pi.product_id = p.id
	 WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL ORDER BY p.id DESC, pi.sort_order LIMIT 1), '')`

const categorySellableCountSQL = `(SELECT COUNT(*) FROM products p WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL
	AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active))`

type layoutCard struct {
	ID       int    `json:"id"`
	Name     string `json:"name"` // raw products.category value: the page is /c/{name}
	Display  string `json:"display"`
	CoverURL string `json:"cover_url"`
}

type layoutSection struct {
	ID       int           `json:"id"`
	Template string        `json:"template"`
	Slots    []*layoutCard `json:"slots"` // layoutSlotCount entries; null = empty (the website skips it)
}

// defaultLayout is what the page shows until staff save a layout: every category that has products, five to a section,
// alternating large left / large right.
func defaultLayout(cards []layoutCard) []layoutSection {
	out := []layoutSection{}
	for i := 0; i < len(cards); i += layoutSlotCount {
		s := layoutSection{ID: -(len(out) + 1), Template: "large_left", Slots: make([]*layoutCard, layoutSlotCount)}
		if len(out)%2 == 1 {
			s.Template = "large_right"
		}
		for j := 0; j < layoutSlotCount && i+j < len(cards); j++ {
			c := cards[i+j]
			s.Slots[j] = &c
		}
		out = append(out, s)
	}
	return out
}

// CategoryLayout serves GET /public/store/category-layout: the sections of the category page with every slot resolved.
// A slot whose category has no sellable products is returned empty.
func (h *SiteHandler) CategoryLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sections := []layoutSection{}
	idx := map[int]int{}
	if rows, err := h.DB.Query(ctx, `SELECT id, template FROM category_layout_sections ORDER BY sort_order, id`); err == nil {
		for rows.Next() {
			var s layoutSection
			if rows.Scan(&s.ID, &s.Template) == nil {
				s.Slots = make([]*layoutCard, layoutSlotCount)
				idx[s.ID] = len(sections)
				sections = append(sections, s)
			}
		}
		rows.Close()
	}
	custom := len(sections) > 0
	if custom {
		if rows, err := h.DB.Query(ctx, `
			SELECT sl.section_id, sl.slot, c.id, c.name, `+storeCategorySQL(r, "c.name")+`, `+categoryCoverSQL+`, `+categorySellableCountSQL+`
			FROM category_layout_slots sl JOIN categories c ON c.id = sl.category_id`); err == nil {
			for rows.Next() {
				var sid, slot, count int
				var c layoutCard
				if rows.Scan(&sid, &slot, &c.ID, &c.Name, &c.Display, &c.CoverURL, &count) == nil && count > 0 {
					if i, ok := idx[sid]; ok && slot >= 0 && slot < layoutSlotCount {
						card := c
						sections[i].Slots[slot] = &card
					}
				}
			}
			rows.Close()
		}
	} else {
		var cards []layoutCard
		for _, root := range h.categoryTree(r) {
			list := root.Children
			if len(list) == 0 {
				list = []siteCategory{root}
			}
			for _, c := range list {
				if c.Count > 0 {
					cards = append(cards, layoutCard{ID: c.ID, Name: c.Name, Display: c.Display, CoverURL: c.CoverURL})
				}
			}
		}
		sections = defaultLayout(cards)
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"sections": sections, "custom": custom})
}
