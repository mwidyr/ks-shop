package handlers

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// isUniqueViolation reports whether err is a Postgres unique-constraint violation (code 23505) -
// used to turn a raw DB error into an actionable message instead of a generic "failed to ...".
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// buildVariantSKU derives a variant's SKU as PRODUCT CODE - COLOR - SIZE (e.g. C002-黑-F), the
// format the 3PL warehouse picks and packs by (see 106_variant_sku_restructure.sql, which applied
// the same rule to every existing variant). colorZh is the full Chinese color name from Color
// Master (resolveColorZh). Spaces are removed from each part, empty parts are skipped. product.sku
// is unique per product, so prefixing with it keeps variant SKUs apart across products.
func buildVariantSKU(productCode, colorZh, size string) string {
	var parts []string
	for _, part := range []string{productCode, colorZh, size} {
		if part = strings.ToUpper(strings.Join(strings.Fields(part), "")); part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, "-")
}

// resolveColorZh maps a variant's stored color to its Color Master Chinese name: an exact Chinese
// name, else a legacy Indonesian name (case-insensitive), else the text as stored.
func resolveColorZh(ctx context.Context, db queryRower, color string) string {
	color = strings.TrimSpace(color)
	if color == "" {
		return ""
	}
	var zh string
	if err := db.QueryRow(ctx, `
		SELECT name_zh FROM colors WHERE name_zh = $1 OR lower(name_id) = lower($1)
		ORDER BY (name_zh = $1) DESC, id LIMIT 1`, color).Scan(&zh); err == nil {
		return zh
	}
	return color
}

// errSKUSuffixesExhausted: the base SKU and all nine 1-digit suffixes are already taken.
var errSKUSuffixesExhausted = errors.New("SKU already used and no free 1-digit suffix is left - change the product code, color or size")

// skuSuffixOrder is the random order the 1-digit suffixes -1..-9 are tried in when a SKU collides.
var skuSuffixOrder = func() []int { return rand.Perm(9) }

// buildUniqueVariantSKU returns base (requestedSKU when a super_user typed one, else
// buildVariantSKU) when no OTHER variant uses it; otherwise base plus a random 1-digit suffix
// (-1..-9) that is still free. excludeVariantID lets an update check against every other variant.
func buildUniqueVariantSKU(ctx context.Context, db queryRower, excludeVariantID int, productCode, color, size, requestedSKU string) (string, error) {
	base := strings.ToUpper(strings.Join(strings.Fields(requestedSKU), ""))
	if base == "" {
		base = buildVariantSKU(productCode, resolveColorZh(ctx, db, color), size)
	}
	taken := func(sku string) (bool, error) {
		var n int
		err := db.QueryRow(ctx, `SELECT COUNT(*) FROM product_variants WHERE sku=$1 AND id != $2`, sku, excludeVariantID).Scan(&n)
		return n > 0, err
	}
	used, err := taken(base)
	if err != nil || !used {
		return base, err
	}
	for _, i := range skuSuffixOrder() {
		sku := fmt.Sprintf("%s-%d", base, i+1)
		if used, err := taken(sku); err != nil || !used {
			return sku, err
		}
	}
	return "", errSKUSuffixesExhausted
}

// recordSKUChange keeps an old SKU findable after it changed (variant_sku_history).
func recordSKUChange(ctx context.Context, tx pgx.Tx, variantID int, oldSKU, newSKU, reason string, userID *int) error {
	if oldSKU == newSKU || oldSKU == "" {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO variant_sku_history (variant_id, old_sku, new_sku, reason, changed_by) VALUES ($1,$2,$3,$4,$5)`,
		variantID, oldSKU, newSKU, reason, userID)
	return err
}

// requestedVariantSKU is the SKU a caller asked for: only a super_user may set one by hand
// (skuManual); everyone else always gets the automatic SKU.
func requestedVariantSKU(r *http.Request, sku string, skuManual bool) (string, bool) {
	if skuManual && isAdmin(r) && strings.TrimSpace(sku) != "" {
		return sku, true
	}
	return "", false
}

// regenerateProductVariantSKUsTx recomputes the automatic SKU of every non-manual variant of a
// product (after its Product Code changed), keeping the old ones in the history.
func regenerateProductVariantSKUsTx(ctx context.Context, tx pgx.Tx, productID int, userID *int) error {
	var code *string
	if err := tx.QueryRow(ctx, `SELECT sku FROM products WHERE id=$1`, productID).Scan(&code); err != nil || code == nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id, sku, color, size FROM product_variants WHERE product_id=$1 AND NOT sku_manual ORDER BY id`, productID)
	if err != nil {
		return err
	}
	type vrow struct {
		id               int
		sku, color, size string
	}
	var vs []vrow
	for rows.Next() {
		var v vrow
		if err := rows.Scan(&v.id, &v.sku, &v.color, &v.size); err != nil {
			rows.Close()
			return err
		}
		vs = append(vs, v)
	}
	rows.Close()
	for _, v := range vs {
		sku, err := buildUniqueVariantSKU(ctx, tx, v.id, *code, v.color, v.size, "")
		if err != nil {
			return err
		}
		if sku == v.sku {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE product_variants SET sku=$1 WHERE id=$2`, sku, v.id); err != nil {
			return err
		}
		if err := recordSKUChange(ctx, tx, v.id, v.sku, sku, "product_code_change", userID); err != nil {
			return err
		}
	}
	return nil
}

type ProductHandler struct {
	DB *pgxpool.Pool
}

type Variant struct {
	ID             int     `json:"id"`
	SKU            string  `json:"sku"`
	SKUManual      bool    `json:"sku_manual"` // typed by a super_user, not recomputed automatically
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
	AllowOversell  bool    `json:"allow_oversell"` // per-variant; seeded from the product's flag at creation, editable after
	IsActive       bool    `json:"is_active"`      // per-variant; seeded true, editable after - hides the variant from the order-creation picker when false
	AvailableStock int     `json:"available_stock"`
	ReserveStock   int     `json:"reserve_stock"`
	OrderStock     int     `json:"order_stock"`
	BrokenStock    int     `json:"broken_stock"`
	IncomingStock  int     `json:"incoming_stock"`
	MinimumStock   int     `json:"minimum_stock"`
	// IncomingETA is the earliest expected arrival date among this variant's Purchase Orders that
	// are not fully received (Inventory shows it when hovering/tapping the Incoming number). Null
	// when there is no incoming PO or none of them has an expected arrival date.
	IncomingETA *string `json:"incoming_eta"`
	// IncomingOpenPO is true when the variant has a Purchase Order not yet fully received, so
	// Inventory can say "ETA not set" when no such PO has an expected arrival date yet.
	IncomingOpenPO bool `json:"incoming_open_po"`
	// ReservedForOrders is the "Ordered" quantity: what customers have ordered but not yet had shipped
	// (orders in pending / processing / ready_to_ship, see orderedByVariantSQL). It is derived, never
	// stored, and only drops when the order ships or is cancelled. Shown as "Dipesan" in Stock Management.
	ReservedForOrders int `json:"reserved_for_orders"`
	// TotalStock is the Available Stock shown to staff: Actual (available_stock) + Incoming - Ordered.
	TotalStock int `json:"total_stock"`
}

type ProductImage struct {
	ID  int    `json:"id"`
	URL string `json:"url"`
}

type Product struct {
	ID                      int               `json:"id"`
	SKU                     string            `json:"sku"` // master product code, distinct from each variant's own sku
	VendorSKU               string            `json:"vendor_sku"`
	Name                    string            `json:"name"`  // canonical (Indonesian) name - never localized here, the edit form saves it back as-is
	Names                   map[string]string `json:"names"` // optional per-language overrides, keyed by language code
	Description             string            `json:"description"`
	Category                string            `json:"category"`
	Brand                   string            `json:"brand"`
	SupplierID              *int              `json:"supplier_id"`    // set once at creation - "change supplier" is done by creating a new product record, not editing this
	BasePrice               float64           `json:"base_price"`     // 0 = unset; frontend defaults new variant prices to this when > 0
	Cost                    *float64          `json:"cost,omitempty"` // admin-only (super_user); nil/omitted entirely for every other role, both on read and on write - see isAdmin()
	IsActive                bool              `json:"is_active"`
	AllowOversell           bool              `json:"allow_oversell"`
	MeasurementBust         string            `json:"measurement_bust"`
	MeasurementWaist        string            `json:"measurement_waist"`
	MeasurementLength       string            `json:"measurement_length"`
	MeasurementBottomLength string            `json:"measurement_bottom_length"`
	MeasurementElasticity   string            `json:"measurement_elasticity"`
	MeasurementNote         string            `json:"measurement_note"`
	Images                  []ProductImage    `json:"images"`
	Variants                []Variant         `json:"variants"`
	UnitsSold               int               `json:"units_sold"`
	StatusLabel             string            `json:"status_label"`
	IsOversell              bool              `json:"is_oversell"`
	CreatedAt               string            `json:"created_at"`
}

// loadProducts returns products with their images, variants, stock, units sold and a computed status
// label (active / low_stock / out_of_stock / nonaktif). ids == nil loads every product, otherwise only
// those (in id order); the child rows (images, variants, sales, ETAs) are restricted the same way, so a
// page of 50 products does not read the whole catalogue.
func (h *ProductHandler) loadProducts(r *http.Request, ids []int) ([]Product, error) {
	admin := isAdmin(r)
	ctx := r.Context()
	rows, err := h.DB.Query(ctx, `
		SELECT id, COALESCE(sku,''), COALESCE(vendor_sku,''), name, names, description, category, COALESCE(brand,''),
		       supplier_id, base_price, cost_rmb, is_active, allow_oversell,
		       COALESCE(measurement_bust,''), COALESCE(measurement_waist,''), COALESCE(measurement_length,''),
		       COALESCE(measurement_bottom_length,''), COALESCE(measurement_elasticity,''), COALESCE(measurement_note,''),
		       created_at
		FROM products WHERE deleted_at IS NULL AND ($1::int[] IS NULL OR id = ANY($1)) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := []Product{}
	idIndex := map[int]int{}
	for rows.Next() {
		var p Product
		var createdAt time.Time
		var cost float64
		var namesRaw []byte
		if err := rows.Scan(&p.ID, &p.SKU, &p.VendorSKU, &p.Name, &namesRaw, &p.Description, &p.Category, &p.Brand,
			&p.SupplierID, &p.BasePrice, &cost, &p.IsActive, &p.AllowOversell,
			&p.MeasurementBust, &p.MeasurementWaist, &p.MeasurementLength, &p.MeasurementBottomLength, &p.MeasurementElasticity, &p.MeasurementNote,
			&createdAt); err != nil {
			continue
		}
		p.Names = parseNames(namesRaw)
		if admin {
			p.Cost = &cost
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		p.Variants = []Variant{}
		p.Images = []ProductImage{}
		idIndex[p.ID] = len(products)
		products = append(products, p)
	}

	irows, err := h.DB.Query(ctx, `
		SELECT product_id, id, url FROM product_images WHERE ($1::int[] IS NULL OR product_id = ANY($1)) ORDER BY product_id, sort_order`, ids)
	if err == nil {
		defer irows.Close()
		for irows.Next() {
			var productID int
			var img ProductImage
			if err := irows.Scan(&productID, &img.ID, &img.URL); err != nil {
				continue
			}
			if idx, ok := idIndex[productID]; ok {
				products[idx].Images = append(products[idx].Images, img)
			}
		}
	}

	vrows, err := h.DB.Query(ctx, `
		SELECT pv.id, pv.product_id, pv.sku, pv.sku_manual, pv.color, pv.size, pv.price, pv.compare_at_price, pv.cost_price, pv.allow_oversell, pv.is_active,
		       sb.available_stock, sb.reserve_stock, sb.order_stock, sb.broken_stock, sb.incoming_stock, sb.minimum_stock,
		       COALESCE(rv.qty, 0)
		FROM product_variants pv
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN `+orderedByVariantSQL+` rv ON rv.variant_id = pv.id
		WHERE ($1::int[] IS NULL OR pv.product_id = ANY($1))
		ORDER BY pv.id`, ids)
	if err != nil {
		return nil, err
	}
	defer vrows.Close()

	totalAvailable := map[int]int{}
	totalMinimum := map[int]int{}
	for vrows.Next() {
		var v Variant
		var productID int
		if err := vrows.Scan(&v.ID, &productID, &v.SKU, &v.SKUManual, &v.Color, &v.Size, &v.Price, &v.CompareAtPrice, &v.CostPrice, &v.AllowOversell, &v.IsActive,
			&v.AvailableStock, &v.ReserveStock, &v.OrderStock, &v.BrokenStock, &v.IncomingStock, &v.MinimumStock, &v.ReservedForOrders); err != nil {
			continue
		}
		v.TotalStock = v.AvailableStock + v.IncomingStock - v.ReservedForOrders
		if idx, ok := idIndex[productID]; ok {
			products[idx].Variants = append(products[idx].Variants, v)
		}
		totalAvailable[productID] += v.AvailableStock
		totalMinimum[productID] += v.MinimumStock
	}

	srows, err := h.DB.Query(ctx, `
		SELECT pv.product_id, COALESCE(SUM(oi.qty),0)
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status <> 'cancelled' AND ($1::int[] IS NULL OR pv.product_id = ANY($1))
		GROUP BY pv.product_id`, ids)
	if err == nil {
		defer srows.Close()
		for srows.Next() {
			var productID, sold int
			if err := srows.Scan(&productID, &sold); err != nil {
				continue
			}
			if idx, ok := idIndex[productID]; ok {
				products[idx].UnitsSold = sold
			}
		}
	}

	var etaVariantIDs []int
	if ids != nil {
		etaVariantIDs = []int{}
		for i := range products {
			for _, v := range products[i].Variants {
				etaVariantIDs = append(etaVariantIDs, v.ID)
			}
		}
	}
	etas := incomingETAs(ctx, h.DB, etaVariantIDs)
	for i := range products {
		for j := range products[i].Variants {
			if info, ok := etas[products[i].Variants[j].ID]; ok {
				products[i].Variants[j].IncomingETA = info.ETA
				products[i].Variants[j].IncomingOpenPO = true
			}
		}
	}

	for i := range products {
		products[i].StatusLabel = statusLabelFor(products[i].IsActive, totalAvailable[products[i].ID], totalMinimum[products[i].ID])
		for _, v := range products[i].Variants {
			if v.TotalStock < 0 {
				products[i].IsOversell = true
				break
			}
		}
	}

	return products, nil
}

// A deactivated product's status always reads "nonaktif" regardless of its stock level - a
// staff member who deliberately deactivated a product needs to see that it's deactivated, not a
// stock-derived label masking it (item 073: a deactivated product with 0 stock used to show
// "Out of Stock", hiding the fact that it was deactivated on purpose).
func statusLabelFor(isActive bool, available, minimum int) string {
	if !isActive {
		return "nonaktif"
	}
	if available == 0 {
		return "out_of_stock"
	}
	if minimum > 0 && available <= minimum {
		return "low_stock"
	}
	return "active"
}

func (h *ProductHandler) Detail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var p Product
	var createdAt time.Time
	var cost float64
	var namesRaw []byte
	err = h.DB.QueryRow(r.Context(), `
		SELECT id, COALESCE(sku,''), COALESCE(vendor_sku,''), name, names, description, category, COALESCE(brand,''),
		       supplier_id, base_price, cost_rmb, is_active, allow_oversell,
		       COALESCE(measurement_bust,''), COALESCE(measurement_waist,''), COALESCE(measurement_length,''),
		       COALESCE(measurement_bottom_length,''), COALESCE(measurement_elasticity,''), COALESCE(measurement_note,''),
		       created_at
		FROM products WHERE id=$1 AND deleted_at IS NULL`, id).
		Scan(&p.ID, &p.SKU, &p.VendorSKU, &p.Name, &namesRaw, &p.Description, &p.Category, &p.Brand,
			&p.SupplierID, &p.BasePrice, &cost, &p.IsActive, &p.AllowOversell,
			&p.MeasurementBust, &p.MeasurementWaist, &p.MeasurementLength, &p.MeasurementBottomLength, &p.MeasurementElasticity, &p.MeasurementNote,
			&createdAt)
	if err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	p.Names = parseNames(namesRaw)
	if isAdmin(r) {
		p.Cost = &cost
	}
	p.CreatedAt = createdAt.Format(time.RFC3339)

	p.Images = []ProductImage{}
	irows, err := h.DB.Query(r.Context(), `SELECT id, url FROM product_images WHERE product_id=$1 ORDER BY sort_order`, id)
	if err == nil {
		defer irows.Close()
		for irows.Next() {
			var img ProductImage
			irows.Scan(&img.ID, &img.URL)
			p.Images = append(p.Images, img)
		}
	}

	vrows, err := h.DB.Query(r.Context(), `
		SELECT pv.id, pv.sku, pv.sku_manual, pv.color, pv.size, pv.price, pv.compare_at_price, pv.cost_price, pv.allow_oversell, pv.is_active,
		       sb.available_stock, sb.reserve_stock, sb.order_stock, sb.broken_stock, sb.incoming_stock, sb.minimum_stock,
		       COALESCE(rv.qty, 0)
		FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN `+orderedByVariantSQL+` rv ON rv.variant_id = pv.id
		WHERE pv.product_id = $1 ORDER BY pv.id`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch variants")
		return
	}
	defer vrows.Close()

	p.Variants = []Variant{}
	for vrows.Next() {
		var v Variant
		vrows.Scan(&v.ID, &v.SKU, &v.SKUManual, &v.Color, &v.Size, &v.Price, &v.CompareAtPrice, &v.CostPrice, &v.AllowOversell, &v.IsActive,
			&v.AvailableStock, &v.ReserveStock, &v.OrderStock, &v.BrokenStock, &v.IncomingStock, &v.MinimumStock, &v.ReservedForOrders)
		v.TotalStock = v.AvailableStock + v.IncomingStock - v.ReservedForOrders
		p.Variants = append(p.Variants, v)
	}
	{
		ids := make([]int, 0, len(p.Variants))
		for _, v := range p.Variants {
			ids = append(ids, v.ID)
		}
		etas := incomingETAs(r.Context(), h.DB, ids)
		for i := range p.Variants {
			if info, ok := etas[p.Variants[i].ID]; ok {
				p.Variants[i].IncomingETA = info.ETA
				p.Variants[i].IncomingOpenPO = true
			}
		}
	}

	respondJSON(w, http.StatusOK, p)
}

type variantInput struct {
	SKU            string  `json:"sku"`
	SKUManual      bool    `json:"sku_manual"` // honored for super_user only (requestedVariantSKU)
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
	AllowOversell  bool    `json:"allow_oversell"`
	IsActive       *bool   `json:"is_active"`
	AvailableStock int     `json:"available_stock"`
	BrokenStock    int     `json:"broken_stock"`
	ReserveStock   int     `json:"reserve_stock"`
	IncomingStock  int     `json:"incoming_stock"`
	MinimumStock   int     `json:"minimum_stock"`
}

const maxProductImages = 5

type createProductRequest struct {
	SKU                     string            `json:"sku"`
	VendorSKU               string            `json:"vendor_sku"`
	Name                    string            `json:"name"`
	Names                   map[string]string `json:"names"`
	Description             string            `json:"description"`
	Category                string            `json:"category"`
	Brand                   string            `json:"brand"`
	SupplierID              *int              `json:"supplier_id"`
	BasePrice               float64           `json:"base_price"`
	Cost                    float64           `json:"cost"` // admin-only - silently ignored (kept at 0) unless the caller is super_user, see isAdmin()
	IsActive                *bool             `json:"is_active"`
	AllowOversell           bool              `json:"allow_oversell"`
	MeasurementBust         string            `json:"measurement_bust"`
	MeasurementWaist        string            `json:"measurement_waist"`
	MeasurementLength       string            `json:"measurement_length"`
	MeasurementBottomLength string            `json:"measurement_bottom_length"`
	MeasurementElasticity   string            `json:"measurement_elasticity"`
	MeasurementNote         string            `json:"measurement_note"`
	Images                  []string          `json:"images"`
	Variants                []variantInput    `json:"variants"`
}

// Create allows super_user/management to add a new product with its photos and initial variants.
func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createProductRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Images) > maxProductImages {
		respondError(w, http.StatusBadRequest, "maksimal 5 foto per produk")
		return
	}
	if len(req.Variants) > 0 && strings.TrimSpace(req.SKU) == "" {
		respondError(w, http.StatusBadRequest, "Product Code is required before adding variants")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	cost := 0.0
	if isAdmin(r) {
		cost = req.Cost
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	namesJSON, namesSearch := encodeNames(req.Names)

	var id int
	err = tx.QueryRow(ctx, `
		INSERT INTO products (sku, vendor_sku, name, names, names_search, description, category, brand, supplier_id, base_price, cost_rmb, is_active, allow_oversell,
		                       measurement_bust, measurement_waist, measurement_length, measurement_bottom_length, measurement_elasticity, measurement_note)
		VALUES (NULLIF($1,''),NULLIF($2,''),$3,$18,$19,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,''),NULLIF($13,''),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),NULLIF($17,'')) RETURNING id`,
		req.SKU, req.VendorSKU, req.Name, req.Description, req.Category, req.Brand, req.SupplierID, req.BasePrice, cost, isActive, req.AllowOversell,
		req.MeasurementBust, req.MeasurementWaist, req.MeasurementLength, req.MeasurementBottomLength, req.MeasurementElasticity, req.MeasurementNote,
		namesJSON, namesSearch).Scan(&id)
	if err != nil {
		respondError(w, http.StatusConflict, "failed to create product (kode produk mungkin sudah dipakai)")
		return
	}

	for i, url := range req.Images {
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)`, id, url, i); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save product image")
			return
		}
	}

	for _, v := range req.Variants {
		requested, manual := requestedVariantSKU(r, v.SKU, v.SKUManual)
		if v.SKU, err = buildUniqueVariantSKU(ctx, tx, 0, req.SKU, v.Color, v.Size, requested); err != nil {
			respondError(w, http.StatusConflict, err.Error())
			return
		}
		v.SKUManual = manual
		if err := insertVariant(ctx, tx, id, v); err != nil {
			if isUniqueViolation(err) {
				respondError(w, http.StatusConflict, "variant SKU \""+v.SKU+"\" is already used by another product - SKUs must be unique across all products, change it and try again")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to create variant "+v.SKU)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	if claims := getClaimsSafe(r); claims != nil {
		logActivity(ctx, h.DB, "product", id, "product_created", &claims.UserID, fmt.Sprintf("%s (%s)", req.Name, req.SKU))
	}

	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

type updateProductRequest struct {
	SKU                     string            `json:"sku"`
	VendorSKU               string            `json:"vendor_sku"`
	Name                    string            `json:"name"`
	Names                   map[string]string `json:"names"`
	Description             string            `json:"description"`
	Category                string            `json:"category"`
	Brand                   string            `json:"brand"`
	SupplierID              *int              `json:"supplier_id"`
	BasePrice               float64           `json:"base_price"`
	Cost                    *float64          `json:"cost"` // admin-only - pointer so a non-admin's payload (which never includes it) leaves the stored value untouched rather than zeroing it
	IsActive                *bool             `json:"is_active"`
	AllowOversell           *bool             `json:"allow_oversell"`
	MeasurementBust         string            `json:"measurement_bust"`
	MeasurementWaist        string            `json:"measurement_waist"`
	MeasurementLength       string            `json:"measurement_length"`
	MeasurementBottomLength string            `json:"measurement_bottom_length"`
	MeasurementElasticity   string            `json:"measurement_elasticity"`
	MeasurementNote         string            `json:"measurement_note"`
}

// Update edits a product's own fields (not variants/stock/photos).
func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req updateProductRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	allowOversell := false
	if req.AllowOversell != nil {
		allowOversell = *req.AllowOversell
	}

	ctx := r.Context()
	var before struct {
		Name      string
		Category  string
		BasePrice float64
		IsActive  bool
		Code      string
	}
	h.DB.QueryRow(ctx, `SELECT name, COALESCE(category,''), base_price, is_active, COALESCE(sku,'') FROM products WHERE id=$1`, id).
		Scan(&before.Name, &before.Category, &before.BasePrice, &before.IsActive, &before.Code)

	if strings.TrimSpace(req.SKU) == "" {
		// Every variant's SKU is derived as PRODUCT-CODE-COLOR-SIZE (see buildVariantSKU) - clearing
		// the product's own code once variants exist would orphan that guarantee entirely.
		var variantCount int
		h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM product_variants WHERE product_id=$1`, id).Scan(&variantCount)
		if variantCount > 0 {
			respondError(w, http.StatusBadRequest, "this product has variants - Product Code can't be cleared, only changed")
			return
		}
	}

	// An absent "names" (e.g. the quick active-toggle payloads built from only a few fields) must
	// leave the stored translations untouched rather than wipe them.
	var namesJSON, namesSearch *string
	if req.Names != nil {
		j, sch := encodeNames(req.Names)
		namesJSON, namesSearch = &j, &sch
	}
	ct, err := h.DB.Exec(ctx, `
		UPDATE products SET sku=NULLIF($1,''), vendor_sku=NULLIF($2,''), name=$3, description=$4, category=$5,
		                     brand=$6, supplier_id=$7, base_price=$8, is_active=$9, allow_oversell=$10,
		                     measurement_bust=NULLIF($11,''), measurement_waist=NULLIF($12,''), measurement_length=NULLIF($13,''),
		                     measurement_bottom_length=NULLIF($14,''), measurement_elasticity=NULLIF($15,''), measurement_note=NULLIF($16,''),
		                     names=COALESCE($18::jsonb, names), names_search=COALESCE($19, names_search)
		                 WHERE id=$17`,
		req.SKU, req.VendorSKU, req.Name, req.Description, req.Category, req.Brand, req.SupplierID, req.BasePrice, isActive, allowOversell,
		req.MeasurementBust, req.MeasurementWaist, req.MeasurementLength, req.MeasurementBottomLength, req.MeasurementElasticity, req.MeasurementNote, id,
		namesJSON, namesSearch)
	if err != nil {
		respondError(w, http.StatusConflict, "failed to update product (kode produk mungkin sudah dipakai)")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}

	// A new Product Code flows into every automatic variant SKU (PRODUCT CODE - COLOR - SIZE).
	if strings.TrimSpace(req.SKU) != "" && !strings.EqualFold(strings.TrimSpace(req.SKU), before.Code) {
		var actor *int
		if c := getClaimsSafe(r); c != nil {
			actor = &c.UserID
		}
		tx, err := h.DB.Begin(ctx)
		if err == nil {
			defer tx.Rollback(ctx)
			err = regenerateProductVariantSKUsTx(ctx, tx, id, actor)
			if err == nil {
				err = tx.Commit(ctx)
			}
		}
		if err != nil {
			respondError(w, http.StatusConflict, "product saved, but its variant SKUs could not be regenerated: "+err.Error())
			return
		}
	}

	// Cost is updated separately, and only for super_user - a non-admin's request body never
	// includes it, but even a crafted one is ignored rather than allowed to change the stored value.
	// Product Cost is the RMB default cost (#133); a manual change is kept in the cost history too.
	if isAdmin(r) && req.Cost != nil && *req.Cost >= 0 {
		claims := appmw.GetClaims(r)
		h.DB.Exec(ctx, `
			WITH old AS (SELECT cost_rmb FROM products WHERE id=$2),
			     upd AS (UPDATE products SET cost_rmb=$1 WHERE id=$2 AND cost_rmb <> $1 RETURNING id)
			INSERT INTO product_cost_history (product_id, old_cost, new_cost, source, changed_by)
			SELECT upd.id, old.cost_rmb, $1, 'manual', $3 FROM upd, old`, *req.Cost, id, claims.UserID)
	}

	var changes []string
	if before.Name != req.Name {
		changes = append(changes, fmt.Sprintf("Nama: %s -> %s", before.Name, req.Name))
	}
	if before.Category != req.Category {
		changes = append(changes, fmt.Sprintf("Kategori: %s -> %s", before.Category, req.Category))
	}
	if before.BasePrice != req.BasePrice {
		changes = append(changes, fmt.Sprintf("Harga Utama: NT$%.0f -> NT$%.0f", before.BasePrice, req.BasePrice))
	}
	if before.IsActive != isActive {
		changes = append(changes, fmt.Sprintf("Status Aktif: %v -> %v", before.IsActive, isActive))
	}
	if len(changes) > 0 {
		if claims := getClaimsSafe(r); claims != nil {
			logActivity(ctx, h.DB, "product", id, "product_updated", &claims.UserID, strings.Join(changes, "; "))
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type setActiveRequest struct {
	IsActive bool `json:"is_active"`
}

// SetActive flips only is_active, used by the product list's quick Activate/Deactivate toggle.
// Deliberately separate from Update: that handler has full-replace semantics over every field
// (name, category, measurements, supplier...), so a toggle request built from only the fields
// visible on the list row would silently null out everything it omits - this endpoint can never
// clobber anything else, regardless of what the caller does or doesn't know about the product.
func (h *ProductHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req setActiveRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	ct, err := h.DB.Exec(ctx, `UPDATE products SET is_active=$1 WHERE id=$2`, req.IsActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update product status")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	if claims := getClaimsSafe(r); claims != nil {
		logActivity(ctx, h.DB, "product", id, "product_updated", &claims.UserID, fmt.Sprintf("Status Aktif: %v", req.IsActive))
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete removes a product (cascades to variants/images/stock) when it has no order history.
// Blocked with 409 for a product with order history (order_items.variant_id has no cascade
// delete) - UNLESS the caller is super_user AND passes ?force=true (item 074), in which case
// it's archived instead: deleted_at is set and the row otherwise untouched, so every historical
// order/report/analytics JOIN against it keeps working exactly as before. The force flag is
// required (not just isAdmin(r) alone) so a plain delete click never silently archives anything
// without the frontend's password-confirmation step actually having happened first - that step
// is what sets force=true on the follow-up call, not merely a UX nicety layered on top.
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM products WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			if !isAdmin(r) || r.URL.Query().Get("force") != "true" {
				respondError(w, http.StatusConflict, "produk pernah digunakan di order; nonaktifkan saja")
				return
			}
			if _, archErr := h.DB.Exec(r.Context(), `UPDATE products SET deleted_at=now(), is_active=false WHERE id=$1`, id); archErr != nil {
				respondError(w, http.StatusInternalServerError, "failed to archive product")
				return
			}
			if claims := getClaimsSafe(r); claims != nil {
				logActivity(r.Context(), h.DB, "product", id, "product_archived", &claims.UserID, "Produk diarsipkan (sudah pernah digunakan di order)")
			}
			respondJSON(w, http.StatusOK, map[string]string{"status": "archived"})
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete product")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteVariant removes one variant (cascades to its stock_buckets row). Blocked with 409 if it
// has order/stock-movement history, same FK-tolerant pattern as Delete.
// DeleteVariant permanently removes a variant (item 050) - Admin-only at the API level too, not
// just hidden in the UI, since the frontend's password-confirmation step is a UX safeguard, not
// an authorization boundary on its own.
func (h *ProductHandler) DeleteVariant(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		respondError(w, http.StatusForbidden, "only an admin can permanently delete a variant")
		return
	}
	variantID, err := strconv.Atoi(chi.URLParam(r, "variantId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM product_variants WHERE id=$1`, variantID)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "varian pernah digunakan di order; tidak bisa dihapus")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete variant")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// CreateVariant adds an additional variant to an existing product (e.g. during edit).
func (h *ProductHandler) CreateVariant(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var v variantInput
	if err := decodeJSON(r, &v); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var productCode *string
	if err := tx.QueryRow(ctx, `SELECT sku FROM products WHERE id=$1`, productID).Scan(&productCode); err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	if productCode == nil || strings.TrimSpace(*productCode) == "" {
		respondError(w, http.StatusBadRequest, "this product has no Product Code yet - set one before adding variants")
		return
	}
	requested, manual := requestedVariantSKU(r, v.SKU, v.SKUManual)
	if v.SKU, err = buildUniqueVariantSKU(ctx, tx, 0, *productCode, v.Color, v.Size, requested); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}
	v.SKUManual = manual

	variantID, err := insertVariantReturningID(ctx, tx, productID, v)
	if err != nil {
		if isUniqueViolation(err) {
			respondError(w, http.StatusConflict, "variant SKU \""+v.SKU+"\" is already used by another product - SKUs must be unique across all products, change it and try again")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to create variant")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": variantID})
}

type updateVariantRequest struct {
	SKU            string  `json:"sku"`
	SKUManual      bool    `json:"sku_manual"` // honored for super_user only (requestedVariantSKU)
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
	AllowOversell  bool    `json:"allow_oversell"`
	IsActive       bool    `json:"is_active"`
	AvailableStock int     `json:"available_stock"`
	BrokenStock    int     `json:"broken_stock"`
	ReserveStock   int     `json:"reserve_stock"`
	IncomingStock  int     `json:"incoming_stock"`
	MinimumStock   int     `json:"minimum_stock"`
}

// UpdateVariant edits a variant's own fields and the staff-editable stock buckets
// (available/broken/reserve/incoming + the minimum-stock alert threshold).
// total_stock and order_stock are never accepted here.
func (h *ProductHandler) UpdateVariant(w http.ResponseWriter, r *http.Request) {
	variantID, err := strconv.Atoi(chi.URLParam(r, "variantId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	var req updateVariantRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var before struct {
		Available, Broken, Reserve, Incoming, OrderStock int
	}
	if err := tx.QueryRow(ctx, `
		SELECT available_stock, broken_stock, reserve_stock, incoming_stock, order_stock FROM stock_buckets WHERE variant_id=$1 FOR UPDATE`,
		variantID).Scan(&before.Available, &before.Broken, &before.Reserve, &before.Incoming, &before.OrderStock); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}
	var productCode *string
	if err := tx.QueryRow(ctx, `
		SELECT p.sku FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id=$1`,
		variantID).Scan(&productCode); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}
	if productCode == nil || strings.TrimSpace(*productCode) == "" {
		respondError(w, http.StatusBadRequest, "this product has no Product Code yet - set one before editing variants")
		return
	}
	var beforePrice float64
	var beforeSKU string
	var wasManual bool
	tx.QueryRow(ctx, `SELECT price, sku, sku_manual FROM product_variants WHERE id=$1`, variantID).Scan(&beforePrice, &beforeSKU, &wasManual)
	requested, manual := requestedVariantSKU(r, req.SKU, req.SKUManual)
	if wasManual && !isAdmin(r) {
		// a super_user's hand-typed SKU stays as it is when someone else edits the variant
		requested, manual = beforeSKU, true
	}
	if req.SKU, err = buildUniqueVariantSKU(ctx, tx, variantID, *productCode, req.Color, req.Size, requested); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}
	claims := getClaimsSafe(r)
	var actor *int
	if claims != nil {
		actor = &claims.UserID
	}
	reason := "variant_edit"
	if manual {
		reason = "manual"
	}
	if err := recordSKUChange(ctx, tx, variantID, beforeSKU, req.SKU, reason, actor); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to record the SKU change")
		return
	}

	if _, err := tx.Exec(ctx, `
		UPDATE product_variants SET sku=$1, color=$2, size=$3, price=$4, compare_at_price=$5, cost_price=$6, allow_oversell=$7, is_active=$8, sku_manual=$10 WHERE id=$9`,
		req.SKU, req.Color, req.Size, req.Price, req.CompareAtPrice, req.CostPrice, req.AllowOversell, req.IsActive, variantID, manual); err != nil {
		if isUniqueViolation(err) {
			respondError(w, http.StatusConflict, "variant SKU \""+req.SKU+"\" is already used by another product - SKUs must be unique across all products, change it and try again")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to update variant")
		return
	}
	if _, err := tx.Exec(ctx, `
		UPDATE stock_buckets SET available_stock=$1, broken_stock=$2, reserve_stock=$3, incoming_stock=$4, minimum_stock=$5 WHERE variant_id=$6`,
		req.AvailableStock, req.BrokenStock, req.ReserveStock, req.IncomingStock, req.MinimumStock, variantID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update stock")
		return
	}

	logAdjustment(ctx, tx, variantID, "available_stock", before.Available, req.AvailableStock, claims)
	logAdjustment(ctx, tx, variantID, "broken_stock", before.Broken, req.BrokenStock, claims)
	logAdjustment(ctx, tx, variantID, "reserve_stock", before.Reserve, req.ReserveStock, claims)
	logAdjustment(ctx, tx, variantID, "incoming_stock", before.Incoming, req.IncomingStock, claims)
	if req.Price != beforePrice {
		var userID *int
		if claims != nil {
			userID = &claims.UserID
		}
		logActivity(ctx, tx, "product_variant", variantID, "price_changed", userID,
			fmt.Sprintf("%s: NT$%.0f -> NT$%.0f", req.SKU, beforePrice, req.Price))
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func insertVariant(ctx context.Context, tx pgx.Tx, productID int, v variantInput) error {
	_, err := insertVariantReturningID(ctx, tx, productID, v)
	return err
}

func insertVariantReturningID(ctx context.Context, tx pgx.Tx, productID int, v variantInput) (int, error) {
	isActive := true
	if v.IsActive != nil {
		isActive = *v.IsActive
	}
	var variantID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO product_variants (product_id, sku, color, size, price, compare_at_price, cost_price, allow_oversell, is_active, sku_manual)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		productID, v.SKU, v.Color, v.Size, v.Price, v.CompareAtPrice, v.CostPrice, v.AllowOversell, isActive, v.SKUManual).Scan(&variantID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO stock_buckets (variant_id, available_stock, reserve_stock, order_stock, broken_stock, incoming_stock, minimum_stock)
		VALUES ($1,$2,$3,0,$4,$5,$6)`,
		variantID, v.AvailableStock, v.ReserveStock, v.BrokenStock, v.IncomingStock, v.MinimumStock); err != nil {
		return 0, err
	}
	return variantID, nil
}

// getClaimsSafe returns claims from the request, or nil if this is called outside a JWTAuth-protected route.
func getClaimsSafe(r *http.Request) *auth.Claims {
	return appmw.GetClaims(r)
}

// isAdmin reports whether the caller is super_user - the only role allowed to see or edit
// Product Cost and the cost-derived Profit figures (COGS/Gross Profit/Net Profit/Margin).
// Applied both on read (redact the field/figures for anyone else) and on write (silently
// ignore a non-admin's attempt to set them, rather than erroring - a crafted request from a
// non-admin token must not be able to change the stored value).
func isAdmin(r *http.Request) bool {
	c := getClaimsSafe(r)
	return c != nil && c.Role == "super_user"
}

// logAdjustment records a stock_movements row for a manual product-edit stock change, if the value actually changed.
func logAdjustment(ctx context.Context, tx pgx.Tx, variantID int, bucket string, before, after int, claims *auth.Claims) {
	delta := after - before
	if delta == 0 {
		return
	}
	qty := delta
	if qty < 0 {
		qty = -qty
	}
	var userID *int
	if claims != nil {
		userID = &claims.UserID
	}
	direction := "increase"
	if delta < 0 {
		direction = "decrease"
	}
	tx.Exec(ctx, `
		INSERT INTO stock_movements (variant_id, bucket_from, bucket_to, qty, event_type, user_id, note)
		VALUES ($1,$2,$2,$3,'stock_adjustment',$4,$5)`,
		variantID, bucket, qty, userID, direction+" via product edit")
}

type stockHistoryRow struct {
	ProductName string `json:"product_name"`
	SKU         string `json:"sku"`
	Color       string `json:"color"`
	Size        string `json:"size"`
	BucketFrom  string `json:"bucket_from"`
	BucketTo    string `json:"bucket_to"`
	Qty         int    `json:"qty"`
	EventType   string `json:"event_type"`
	Note        string `json:"note"`
	ChangedBy   string `json:"changed_by"`
	CreatedAt   string `json:"created_at"`
}

// StockHistory returns the stock_movements audit trail (real data already recorded by order
// creation/lifecycle and manual product-edit adjustments) for the "Riwayat Perubahan" tab.
func (h *ProductHandler) StockHistory(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := " WHERE 1=1 "
	args := []interface{}{}
	argN := 1
	if search := q.Get("q"); search != "" {
		where += " AND " + productSearchSQL("p", "$"+strconv.Itoa(argN))
		args = append(args, likePattern(search))
		argN++
	}
	if direction := q.Get("direction"); direction == "in" {
		where += " AND sm.qty >= 0 AND sm.bucket_to = 'available_stock'"
	} else if direction == "out" {
		where += " AND sm.event_type IN ('shipment_deducted')"
	}

	limit := 100
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
		limit = l
		if limit > 500 { // never the whole movement history in one response
			limit = 500
		}
	}

	query := `
		SELECT ` + productNameSQL(r, "p") + `, pv.sku, pv.color, pv.size, COALESCE(sm.bucket_from,'-'), COALESCE(sm.bucket_to,'-'),
		       sm.qty, sm.event_type, COALESCE(sm.note,''), COALESCE(u.name,'system'), sm.created_at
		FROM stock_movements sm
		JOIN product_variants pv ON pv.id = sm.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN users u ON u.id = sm.user_id` +
		where + " ORDER BY sm.created_at DESC LIMIT " + strconv.Itoa(limit)

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch stock history")
		return
	}
	defer rows.Close()

	list := []stockHistoryRow{}
	for rows.Next() {
		var row stockHistoryRow
		var createdAt time.Time
		if err := rows.Scan(&row.ProductName, &row.SKU, &row.Color, &row.Size, &row.BucketFrom, &row.BucketTo,
			&row.Qty, &row.EventType, &row.Note, &row.ChangedBy, &createdAt); err != nil {
			continue
		}
		row.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}

// --- Purchase Rules (product-level override of the supplier's own defaults) ---

type purchaseRulesView struct {
	MinOrderQty       *int     `json:"min_order_qty"`
	MinColorQty       *int     `json:"min_color_qty"`
	MinOrderAmount    *float64 `json:"min_order_amount"`
	OrderMultiple     *int     `json:"order_multiple"`
	MixedColorAllowed *bool    `json:"mixed_color_allowed"`
	PackSetQty        *int     `json:"pack_set_qty"`
}

// GetPurchaseRules returns a product's own purchase rule overrides, if any (nil fields mean
// "fall back to the supplier's default" - see UpdatePurchaseRules and the shared validation
// used by Create Purchase Order / Replenishment Planning).
func (h *ProductHandler) GetPurchaseRules(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var v purchaseRulesView
	err = h.DB.QueryRow(r.Context(), `
		SELECT min_order_qty, min_color_qty, min_order_amount, order_multiple, mixed_color_allowed, pack_set_qty
		FROM product_purchase_rules WHERE product_id=$1`, id).
		Scan(&v.MinOrderQty, &v.MinColorQty, &v.MinOrderAmount, &v.OrderMultiple, &v.MixedColorAllowed, &v.PackSetQty)
	if err != nil {
		respondJSON(w, http.StatusOK, purchaseRulesView{}) // no override row yet - all nil, falls back to supplier defaults
		return
	}
	respondJSON(w, http.StatusOK, v)
}

// UpdatePurchaseRules upserts a product's purchase rule overrides.
func (h *ProductHandler) UpdatePurchaseRules(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req purchaseRulesView
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	mixedColor := true
	if req.MixedColorAllowed != nil {
		mixedColor = *req.MixedColorAllowed
	}
	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO product_purchase_rules (product_id, min_order_qty, min_color_qty, min_order_amount, order_multiple, mixed_color_allowed, pack_set_qty)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (product_id) DO UPDATE SET
			min_order_qty=EXCLUDED.min_order_qty, min_color_qty=EXCLUDED.min_color_qty,
			min_order_amount=EXCLUDED.min_order_amount, order_multiple=EXCLUDED.order_multiple,
			mixed_color_allowed=EXCLUDED.mixed_color_allowed, pack_set_qty=EXCLUDED.pack_set_qty`,
		id, req.MinOrderQty, req.MinColorQty, req.MinOrderAmount, req.OrderMultiple, mixedColor, req.PackSetQty)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save purchase rules")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// InventoryValue returns Sum(actual stock x the variant's own unit cost) across every non-deleted
// product/variant. super_user only: cost is admin-only data (see isAdmin), and this total would
// let anyone back out the cost, so non-admins get 403 rather than a hidden number. Oversold
// variants (negative actual stock) count as 0 - they hold no value, and must not reduce the total.
func (h *ProductHandler) InventoryValue(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		respondError(w, http.StatusForbidden, "inventory value is only available to Admin")
		return
	}
	var value float64
	err := h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(GREATEST(sb.available_stock, 0) * pv.cost_price), 0)
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
		JOIN stock_buckets sb ON sb.variant_id = pv.id`).Scan(&value)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to compute inventory value")
		return
	}
	respondJSON(w, http.StatusOK, map[string]float64{"inventory_value": value})
}

// incomingETAs maps variant id -> earliest expected arrival date (yyyy-mm-dd) across Purchase
// Orders that still have quantity outstanding (not fully received, not cancelled). Only POs awaiting delivery count, so a received PO never shows an
// ETA. variantIDs == nil means every variant.
func incomingETAs(ctx context.Context, db *pgxpool.Pool, variantIDs []int) map[int]incomingETAInfo {
	out := map[int]incomingETAInfo{}
	q := `
		SELECT pi.variant_id, MIN(p.expected_arrival_date)::text
		FROM purchase_items pi
		JOIN purchases p ON p.id = pi.purchase_id
		WHERE p.status IN ('ordered','pending_arrival','partially_received')
		  AND pi.qty > COALESCE(pi.received_qty, 0)`
	args := []interface{}{}
	if variantIDs != nil {
		q += ` AND pi.variant_id = ANY($1)`
		args = append(args, variantIDs)
	}
	rows, err := db.Query(ctx, q+` GROUP BY pi.variant_id`, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var eta *string
		if rows.Scan(&id, &eta) == nil {
			out[id] = incomingETAInfo{ETA: eta}
		}
	}
	return out
}

// incomingETAInfo: a variant present in the map has an open (not fully received) PO; ETA is the
// earliest expected arrival among them, nil when none has a date yet.
type incomingETAInfo struct{ ETA *string }
