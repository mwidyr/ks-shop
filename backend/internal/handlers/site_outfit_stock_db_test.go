package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// Runs only with TEST_DATABASE_URL: a host outfit reports live stock per item and totals only what can be bought.
func TestHostOutfitCarriesStock(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var host, outfit, product int
	slug := "t-outfit-" + sfx
	must(db.QueryRow(ctx, `INSERT INTO hosts (name, slug, is_active, is_public, location_id) VALUES ('T Outfit',$1,true,true,(SELECT id FROM host_locations ORDER BY id LIMIT 1)) RETURNING id`, slug).Scan(&host))
	must(db.QueryRow(ctx, `INSERT INTO products (name, sku) VALUES ('T-Outfit product','TOP-'||$1::text) RETURNING id`, sfx).Scan(&product))
	var inStock, soldOut int
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price, color, size) VALUES ($1,$2,190,'Hitam','Freesize') RETURNING id`, product, "T-OF-A-"+sfx).Scan(&inStock))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price, color, size) VALUES ($1,$2,290,'Abu','Freesize') RETURNING id`, product, "T-OF-B-"+sfx).Scan(&soldOut))
	_, err := db.Exec(ctx, `INSERT INTO stock_buckets (variant_id, available_stock) VALUES ($1,5),($2,0) ON CONFLICT (variant_id) DO UPDATE SET available_stock = EXCLUDED.available_stock`, inStock, soldOut)
	must(err)
	must(db.QueryRow(ctx, `INSERT INTO host_outfits (host_id, title) VALUES ($1,'Cozy') RETURNING id`, host).Scan(&outfit))
	_, err = db.Exec(ctx, `INSERT INTO host_outfit_items (outfit_id, variant_id, sort_order) VALUES ($1,$2,0),($1,$3,1)`, outfit, inStock, soldOut)
	must(err)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM host_outfit_items WHERE outfit_id=$1`, outfit)
		db.Exec(ctx, `DELETE FROM host_outfits WHERE id=$1`, outfit)
		db.Exec(ctx, `DELETE FROM hosts WHERE id=$1`, host)
		db.Exec(ctx, `DELETE FROM stock_buckets WHERE variant_id IN ($1,$2)`, inStock, soldOut)
		db.Exec(ctx, `DELETE FROM product_variants WHERE product_id=$1`, product)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
	})

	r := chi.NewRouter()
	r.Get("/hosts/{slug}", (&SiteHandler{DB: db}).Host)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/hosts/"+slug, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("host: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Outfits []siteOutfit `json:"outfits"`
	}
	must(json.Unmarshal(w.Body.Bytes(), &out))
	if len(out.Outfits) != 1 || len(out.Outfits[0].Items) != 2 {
		t.Fatalf("both items are listed: %+v", out.Outfits)
	}
	o := out.Outfits[0]
	if o.Items[0].Stock != 5 || o.Items[1].Stock != 0 {
		t.Fatalf("stock per item: %+v", o.Items)
	}
	if o.Total != 190 {
		t.Fatalf("the total counts only items that can be bought, got %v", o.Total)
	}
	if o.Items[0].SKU != "TOP-"+sfx {
		t.Fatalf("item carries the product sku for the cart: %q", o.Items[0].SKU)
	}
}
