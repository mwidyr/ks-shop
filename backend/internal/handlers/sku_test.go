package handlers

import (
	"context"
	"errors"
	"regexp"
	"testing"
)

func TestBuildVariantSKU(t *testing.T) {
	cases := []struct{ code, color, size, want string }{
		{"c002", "Black", "f", "C002-BLACK-F"},
		{"P026", "White", "M", "P026-WHITE-M"},
		{" P026 ", "Light Blue", " XL ", "P026-LIGHTBLUE-XL"},
		{"P026", "", "M", "P026-M"},
		{"P026", "Off White", "", "P026-OFFWHITE"},
		{"A1", "Broken White", "S", "A1-BROKENWHITE-S"},
	}
	for _, c := range cases {
		if got := buildVariantSKU(c.code, c.color, c.size); got != c.want {
			t.Errorf("buildVariantSKU(%q,%q,%q) = %q, want %q", c.code, c.color, c.size, got, c.want)
		}
	}
}

// TestVariantSKUAgainstDatabase: color resolution, the 1-digit suffix and the product code change,
// inside a rolled-back transaction. Runs only with TEST_DATABASE_URL (see liveTestDB).
func TestVariantSKUAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}

	// every SKU left by migration 106 follows the pattern and nothing collides
	var bad int
	must(tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_variants WHERE sku LIKE '#tmp-%'`).Scan(&bad))
	if bad != 0 {
		t.Fatalf("%d variants left on a placeholder SKU", bad)
	}

	for in, want := range map[string]string{"黑": "Black", "Hitam": "Black", "hitam": "Black", "BLACK": "Black", "淺藍": "Light Blue", "Neon Lime": "Neon Lime"} {
		if got := resolveSKUColor(ctx, tx, in); got != want {
			t.Fatalf("resolveSKUColor(%q) = %q, want %q", in, got, want)
		}
	}

	var productID int
	code := "TSKU-ZZ"
	must(tx.QueryRow(ctx, `INSERT INTO products (name, sku) VALUES ('T-SKU', $1) RETURNING id`, code).Scan(&productID))
	first, err := buildUniqueVariantSKU(ctx, tx, 0, code, "Hitam", "f", "")
	must(err)
	if first != code+"-BLACK-F" {
		t.Fatalf("first SKU %q", first)
	}
	_, err = tx.Exec(ctx, `INSERT INTO product_variants (product_id, sku, color, size, price) VALUES ($1,$2,'Hitam','F',1)`, productID, first)
	must(err)
	suffix := regexp.MustCompile(`^` + regexp.QuoteMeta(first) + `-[1-9]$`)
	for i := 0; i < 9; i++ {
		sku, err := buildUniqueVariantSKU(ctx, tx, 0, code, "黑", "F", "")
		must(err)
		if !suffix.MatchString(sku) {
			t.Fatalf("collision %d got %q, want a 1-digit suffix", i, sku)
		}
		_, err = tx.Exec(ctx, `INSERT INTO product_variants (product_id, sku, color, size, price) VALUES ($1,$2,'黑','F',1)`, productID, sku)
		must(err)
	}
	if _, err := buildUniqueVariantSKU(ctx, tx, 0, code, "黑", "F", ""); !errors.Is(err, errSKUSuffixesExhausted) {
		t.Fatalf("all suffixes taken: got %v", err)
	}

	// a new product code flows into every automatic SKU, with the old ones in the history
	var manualID int
	must(tx.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, color, size, price, sku_manual) VALUES ($1,'KEEP-ME','白','M',1,true) RETURNING id`, productID).Scan(&manualID))
	_, err = tx.Exec(ctx, `UPDATE products SET sku=$1 WHERE id=$2`, code+"X", productID)
	must(err)
	must(regenerateProductVariantSKUsTx(ctx, tx, productID, nil))
	var moved, history int
	must(tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_variants WHERE product_id=$1 AND sku LIKE $2`, productID, code+"X-BLACK-F%").Scan(&moved))
	must(tx.QueryRow(ctx, `SELECT COUNT(*) FROM variant_sku_history h JOIN product_variants pv ON pv.id=h.variant_id WHERE pv.product_id=$1 AND h.reason='product_code_change'`, productID).Scan(&history))
	if moved != 10 || history != 10 {
		t.Fatalf("regenerated %d, history %d, want 10 each", moved, history)
	}
	var kept string
	must(tx.QueryRow(ctx, `SELECT sku FROM product_variants WHERE id=$1`, manualID).Scan(&kept))
	if kept != "KEEP-ME" {
		t.Fatalf("manual SKU changed to %q", kept)
	}

	// a new English color name flows into the SKUs of every variant stored in that color
	_, err = tx.Exec(ctx, `UPDATE colors SET name_en='Jet Black' WHERE name_zh='黑'`)
	must(err)
	must(regenerateColorVariantSKUsTx(ctx, tx, []string{"黑", "Hitam", "Black", "Jet Black"}, "color_rename", nil))
	must(tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_variants WHERE product_id=$1 AND sku LIKE $2`, productID, code+"X-JETBLACK-F%").Scan(&moved))
	if moved != 10 {
		t.Fatalf("color rename moved %d SKUs, want 10", moved)
	}
}
