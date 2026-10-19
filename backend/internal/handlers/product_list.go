package handlers

import (
	"net/http"
	"strconv"
	"strings"
)

// The product list comes in four shapes, chosen by the query string:
//
//	(none)        every product, full detail (pickers, forms and analytics that need the whole catalogue)
//	?page=...     ONE page of slim rows, searched / filtered / sorted by the server (the Products page)
//	?ids=1,2,3    those products, full detail (bulk actions on the selected rows)
//	?export=1     every product matching the same filters, full detail (CSV export)
//
// Filters (page and export): q, tab (all|active|inactive), category, color + color_alt, stock
// (all|has_stock|low_stock|out_of_stock|oversell), sort (newest|stock_desc|stock_asc|price_desc|price_asc).

type productQuery struct {
	Q, Tab, Category, Color, ColorAlt, Stock, Sort string
}

func parseProductQuery(r *http.Request) productQuery {
	q := r.URL.Query()
	return productQuery{
		Q: strings.TrimSpace(q.Get("q")), Tab: q.Get("tab"), Category: q.Get("category"),
		Color: q.Get("color"), ColorAlt: q.Get("color_alt"), Stock: q.Get("stock"), Sort: q.Get("sort"),
	}
}

var productSorts = map[string]string{
	"newest":     "a.created_at DESC, a.id DESC",
	"stock_desc": "a.stock DESC, a.id DESC",
	"stock_asc":  "a.stock ASC, a.id ASC",
	"price_desc": "a.min_price DESC, a.id DESC",
	"price_asc":  "a.min_price ASC, a.id ASC",
}

// productAggSQL: one row per product with the totals the filters and sorts need. Total stock of a
// product is the sum of its variants' Available (Actual + Incoming - Ordered), as the page showed it.
const productAggSQL = `
	WITH a AS (
		SELECT p.id, p.created_at, p.is_active, p.category, p.name, p.names_search, COALESCE(p.sku,'') AS sku,
		       COALESCE(SUM(sb.available_stock + sb.incoming_stock - COALESCE(rv.qty,0)),0)::int AS stock,
		       COALESCE(MIN(pv.price),0) AS min_price,
		       COALESCE(bool_or(sb.available_stock + sb.incoming_stock - COALESCE(rv.qty,0) < 0), false) AS oversell
		FROM products p
		LEFT JOIN product_variants pv ON pv.product_id = p.id
		LEFT JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN ` + orderedByVariantSQL + ` rv ON rv.variant_id = pv.id
		WHERE p.deleted_at IS NULL
		GROUP BY p.id
	)`

// where builds the filter over the aggregate rows (alias a) and its arguments ($1...).
func (q productQuery) where() (string, []any) {
	var conds []string
	var args []any
	arg := func(v any) string { args = append(args, v); return "$" + strconv.Itoa(len(args)) }
	switch q.Tab {
	case "active":
		conds = append(conds, "a.is_active")
	case "inactive":
		conds = append(conds, "NOT a.is_active")
	}
	if q.Q != "" {
		// Every product field, one character is enough (see productSearchSQL).
		like := arg(likePattern(q.Q))
		conds = append(conds, "a.id IN (SELECT p.id FROM products p WHERE "+productSearchSQL("p", like)+")")
	}
	if q.Category != "" {
		conds = append(conds, "a.category = "+arg(q.Category))
	}
	if q.Color != "" {
		colors := []string{q.Color}
		if q.ColorAlt != "" {
			colors = append(colors, q.ColorAlt)
		}
		conds = append(conds, "EXISTS (SELECT 1 FROM product_variants cv WHERE cv.product_id = a.id AND cv.color = ANY("+arg(colors)+"))")
	}
	switch q.Stock {
	case "has_stock":
		conds = append(conds, "a.stock > 0")
	case "low_stock":
		conds = append(conds, "(a.stock > 0 AND a.stock <= 5)")
	case "out_of_stock":
		conds = append(conds, "a.stock = 0")
	case "oversell":
		conds = append(conds, "a.oversell")
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// matchingProductIDs returns the ids matching the query in the requested order; with a page it returns
// only that page's ids plus the total number of matches.
func (h *ProductHandler) matchingProductIDs(r *http.Request, q productQuery, pg *pageParams) ([]int, int, error) {
	where, args := q.where()
	countArgs := args // the ranking parameter below is not part of the count query
	order := pickSort(q.Sort, productSorts, productSorts["newest"])
	if q.Q != "" && (q.Sort == "" || q.Sort == "newest") {
		// A short query matches a lot: with the default order, codes / names that START with the text come
		// first (C -> C001, C002 ...). An explicit price / stock sort keeps its own order. The search text is $1.
		args = append(args, prefixPattern(q.Q))
		order = searchRankSQL("a.sku", "a.name", "$"+strconv.Itoa(len(args)), "$1") +
			", CASE WHEN a.sku ILIKE $" + strconv.Itoa(len(args)) + " THEN a.sku END, " + order // C001, C002 ... in code order
	}
	total := 0
	if pg != nil {
		if err := h.DB.QueryRow(r.Context(), productAggSQL+" SELECT COUNT(*) FROM a"+where, countArgs...).Scan(&total); err != nil {
			return nil, 0, err
		}
	}
	query := productAggSQL + " SELECT a.id FROM a" + where + " ORDER BY " + order
	if pg != nil {
		args = append(args, pg.Size, pg.Offset)
		query += " LIMIT $" + strconv.Itoa(len(args)-1) + " OFFSET $" + strconv.Itoa(len(args))
	}
	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	if pg == nil {
		total = len(ids)
	}
	return ids, total, rows.Err()
}

// inIDOrder puts the loaded products (id order) into the order of ids.
func inIDOrder(products []Product, ids []int) []Product {
	byID := make(map[int]Product, len(products))
	for _, p := range products {
		byID[p.ID] = p
	}
	out := make([]Product, 0, len(ids))
	for _, id := range ids {
		if p, ok := byID[id]; ok {
			out = append(out, p)
		}
	}
	return out
}

type productListVariant struct {
	ID             int     `json:"id"`
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	TotalStock     int     `json:"total_stock"`
}

// productListItem is a row of the Products page: only what the row shows. Description, measurements,
// supplier, cost, base price and the per-variant stock buckets are left out (the bulk actions and the
// edit form load the full product when they need it).
type productListItem struct {
	ID          int                  `json:"id"`
	SKU         string               `json:"sku"`
	Name        string               `json:"name"`
	Names       map[string]string    `json:"names"`
	Category    string               `json:"category"`
	IsActive    bool                 `json:"is_active"`
	IsOversell  bool                 `json:"is_oversell"`
	UnitsSold   int                  `json:"units_sold"`
	StatusLabel string               `json:"status_label"`
	CreatedAt   string               `json:"created_at"`
	Images      []ProductImage       `json:"images"`
	Variants    []productListVariant `json:"variants"`
}

func toListItems(products []Product) []productListItem {
	out := make([]productListItem, 0, len(products))
	for _, p := range products {
		it := productListItem{
			ID: p.ID, SKU: p.SKU, Name: p.Name, Names: p.Names, Category: p.Category, IsActive: p.IsActive,
			IsOversell: p.IsOversell, UnitsSold: p.UnitsSold, StatusLabel: p.StatusLabel, CreatedAt: p.CreatedAt,
			Images: p.Images, Variants: make([]productListVariant, 0, len(p.Variants)),
		}
		for _, v := range p.Variants {
			it.Variants = append(it.Variants, productListVariant{ID: v.ID, Color: v.Color, Size: v.Size, Price: v.Price, CompareAtPrice: v.CompareAtPrice, TotalStock: v.TotalStock})
		}
		out = append(out, it)
	}
	return out
}

func parseIDList(raw string) []int {
	ids := []int{}
	for _, part := range strings.Split(raw, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(part)); err == nil && n > 0 {
			ids = append(ids, n)
		}
	}
	return ids
}

// List serves GET /products in the four shapes described above.
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fail := func() { respondError(w, http.StatusInternalServerError, "failed to fetch products") }

	switch {
	case q.Get("ids") != "":
		ids := parseIDList(q.Get("ids"))
		if len(ids) > 500 {
			ids = ids[:500]
		}
		products, err := h.loadProducts(r, ids)
		if err != nil {
			fail()
			return
		}
		respondJSON(w, http.StatusOK, inIDOrder(products, ids))

	case q.Get("export") == "1":
		ids, _, err := h.matchingProductIDs(r, parseProductQuery(r), nil)
		if err != nil {
			fail()
			return
		}
		products, err := h.loadProducts(r, ids)
		if err != nil {
			fail()
			return
		}
		respondJSON(w, http.StatusOK, inIDOrder(products, ids))

	case q.Get("page") != "":
		pg := parsePage(r, 50, 100)
		ids, total, err := h.matchingProductIDs(r, parseProductQuery(r), &pg)
		if err != nil {
			fail()
			return
		}
		products, err := h.loadProducts(r, ids)
		if err != nil {
			fail()
			return
		}
		var counts struct {
			All      int `json:"all"`
			Active   int `json:"active"`
			Inactive int `json:"inactive"`
		}
		h.DB.QueryRow(r.Context(), `
			SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active), COUNT(*) FILTER (WHERE NOT is_active)
			FROM products WHERE deleted_at IS NULL`).Scan(&counts.All, &counts.Active, &counts.Inactive)
		resp := pageResponse(toListItems(inIDOrder(products, ids)), total, pg)
		resp["counts"] = counts
		respondJSON(w, http.StatusOK, resp)

	default:
		products, err := h.loadProducts(r, nil)
		if err != nil {
			fail()
			return
		}
		respondJSON(w, http.StatusOK, products)
	}
}
