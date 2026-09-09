package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

type ProductHandler struct {
	DB *pgxpool.Pool
}

type Variant struct {
	ID             int     `json:"id"`
	SKU            string  `json:"sku"`
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
	AvailableStock int     `json:"available_stock"`
	ReserveStock   int     `json:"reserve_stock"`
	OrderStock     int     `json:"order_stock"`
	BrokenStock    int     `json:"broken_stock"`
	IncomingStock  int     `json:"incoming_stock"`
	MinimumStock   int     `json:"minimum_stock"`
	TotalStock     int     `json:"total_stock"`
}

type ProductImage struct {
	ID  int    `json:"id"`
	URL string `json:"url"`
}

type Product struct {
	ID          int            `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	Brand       string         `json:"brand"`
	IsActive    bool           `json:"is_active"`
	Images      []ProductImage `json:"images"`
	Variants    []Variant      `json:"variants"`
	UnitsSold   int            `json:"units_sold"`
	StatusLabel string         `json:"status_label"`
}

// List returns all products with their images, variants, stock, units sold and a
// computed status label (active / low_stock / out_of_stock / nonaktif).
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT id, name, description, category, COALESCE(brand,''), is_active FROM products ORDER BY id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	defer rows.Close()

	products := []Product{}
	idIndex := map[int]int{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Category, &p.Brand, &p.IsActive); err != nil {
			continue
		}
		p.Variants = []Variant{}
		p.Images = []ProductImage{}
		idIndex[p.ID] = len(products)
		products = append(products, p)
	}

	irows, err := h.DB.Query(r.Context(), `
		SELECT product_id, id, url FROM product_images ORDER BY product_id, sort_order`)
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

	vrows, err := h.DB.Query(r.Context(), `
		SELECT pv.id, pv.product_id, pv.sku, pv.color, pv.size, pv.price, pv.compare_at_price, pv.cost_price,
		       sb.available_stock, sb.reserve_stock, sb.order_stock, sb.broken_stock, sb.incoming_stock, sb.minimum_stock
		FROM product_variants pv
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		ORDER BY pv.id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch variants")
		return
	}
	defer vrows.Close()

	totalAvailable := map[int]int{}
	totalMinimum := map[int]int{}
	for vrows.Next() {
		var v Variant
		var productID int
		if err := vrows.Scan(&v.ID, &productID, &v.SKU, &v.Color, &v.Size, &v.Price, &v.CompareAtPrice, &v.CostPrice,
			&v.AvailableStock, &v.ReserveStock, &v.OrderStock, &v.BrokenStock, &v.IncomingStock, &v.MinimumStock); err != nil {
			continue
		}
		v.TotalStock = v.AvailableStock + v.ReserveStock + v.BrokenStock
		if idx, ok := idIndex[productID]; ok {
			products[idx].Variants = append(products[idx].Variants, v)
		}
		totalAvailable[productID] += v.AvailableStock
		totalMinimum[productID] += v.MinimumStock
	}

	srows, err := h.DB.Query(r.Context(), `
		SELECT pv.product_id, COALESCE(SUM(oi.qty),0)
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN orders o ON o.id = oi.order_id
		WHERE o.status <> 'cancelled'
		GROUP BY pv.product_id`)
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

	for i := range products {
		products[i].StatusLabel = statusLabelFor(products[i].IsActive, totalAvailable[products[i].ID], totalMinimum[products[i].ID])
	}

	respondJSON(w, http.StatusOK, products)
}

func statusLabelFor(isActive bool, available, minimum int) string {
	if available == 0 {
		return "out_of_stock"
	}
	if minimum > 0 && available <= minimum {
		return "low_stock"
	}
	if isActive {
		return "active"
	}
	return "nonaktif"
}

func (h *ProductHandler) Detail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var p Product
	err = h.DB.QueryRow(r.Context(), `SELECT id, name, description, category, COALESCE(brand,''), is_active FROM products WHERE id=$1`, id).
		Scan(&p.ID, &p.Name, &p.Description, &p.Category, &p.Brand, &p.IsActive)
	if err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}

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
		SELECT pv.id, pv.sku, pv.color, pv.size, pv.price, pv.compare_at_price, pv.cost_price,
		       sb.available_stock, sb.reserve_stock, sb.order_stock, sb.broken_stock, sb.incoming_stock, sb.minimum_stock
		FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		WHERE pv.product_id = $1 ORDER BY pv.id`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch variants")
		return
	}
	defer vrows.Close()

	p.Variants = []Variant{}
	for vrows.Next() {
		var v Variant
		vrows.Scan(&v.ID, &v.SKU, &v.Color, &v.Size, &v.Price, &v.CompareAtPrice, &v.CostPrice,
			&v.AvailableStock, &v.ReserveStock, &v.OrderStock, &v.BrokenStock, &v.IncomingStock, &v.MinimumStock)
		v.TotalStock = v.AvailableStock + v.ReserveStock + v.BrokenStock
		p.Variants = append(p.Variants, v)
	}

	respondJSON(w, http.StatusOK, p)
}

type variantInput struct {
	SKU            string  `json:"sku"`
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
	AvailableStock int     `json:"available_stock"`
	BrokenStock    int     `json:"broken_stock"`
	ReserveStock   int     `json:"reserve_stock"`
	IncomingStock  int     `json:"incoming_stock"`
	MinimumStock   int     `json:"minimum_stock"`
}

const maxProductImages = 5

type createProductRequest struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	Brand       string         `json:"brand"`
	Images      []string       `json:"images"`
	Variants    []variantInput `json:"variants"`
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

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var id int
	err = tx.QueryRow(ctx, `
		INSERT INTO products (name, description, category, brand) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.Name, req.Description, req.Category, req.Brand).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create product")
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
		if err := insertVariant(ctx, tx, id, v); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create variant "+v.SKU)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

type updateProductRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Brand       string `json:"brand"`
	IsActive    *bool  `json:"is_active"`
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
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE products SET name=$1, description=$2, category=$3, brand=$4, is_active=$5 WHERE id=$6`,
		req.Name, req.Description, req.Category, req.Brand, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update product")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete removes a product (cascades to variants/images/stock). Blocked with 409 if any of
// its variants have order history, since order_items.variant_id has no cascade delete.
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM products WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "produk pernah digunakan di order; nonaktifkan saja")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete product")
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
	if err := decodeJSON(r, &v); err != nil || v.SKU == "" {
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

	variantID, err := insertVariantReturningID(ctx, tx, productID, v)
	if err != nil {
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
	Color          string  `json:"color"`
	Size           string  `json:"size"`
	Price          float64 `json:"price"`
	CompareAtPrice float64 `json:"compare_at_price"`
	CostPrice      float64 `json:"cost_price"`
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
		Available, Broken, Reserve, Incoming int
	}
	if err := tx.QueryRow(ctx, `
		SELECT available_stock, broken_stock, reserve_stock, incoming_stock FROM stock_buckets WHERE variant_id=$1 FOR UPDATE`,
		variantID).Scan(&before.Available, &before.Broken, &before.Reserve, &before.Incoming); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}

	if _, err := tx.Exec(ctx, `
		UPDATE product_variants SET sku=$1, color=$2, size=$3, price=$4, compare_at_price=$5, cost_price=$6 WHERE id=$7`,
		req.SKU, req.Color, req.Size, req.Price, req.CompareAtPrice, req.CostPrice, variantID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update variant")
		return
	}
	if _, err := tx.Exec(ctx, `
		UPDATE stock_buckets SET available_stock=$1, broken_stock=$2, reserve_stock=$3, incoming_stock=$4, minimum_stock=$5 WHERE variant_id=$6`,
		req.AvailableStock, req.BrokenStock, req.ReserveStock, req.IncomingStock, req.MinimumStock, variantID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update stock")
		return
	}

	claims := getClaimsSafe(r)
	logAdjustment(ctx, tx, variantID, "available_stock", before.Available, req.AvailableStock, claims)
	logAdjustment(ctx, tx, variantID, "broken_stock", before.Broken, req.BrokenStock, claims)
	logAdjustment(ctx, tx, variantID, "reserve_stock", before.Reserve, req.ReserveStock, claims)
	logAdjustment(ctx, tx, variantID, "incoming_stock", before.Incoming, req.IncomingStock, claims)

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
	var variantID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO product_variants (product_id, sku, color, size, price, compare_at_price, cost_price)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		productID, v.SKU, v.Color, v.Size, v.Price, v.CompareAtPrice, v.CostPrice).Scan(&variantID); err != nil {
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
