package handlers

import (
	"context"
	"strings"
	"testing"
)

func TestOversellRoom(t *testing.T) {
	three := 3
	cases := []struct {
		name      string
		available int
		allow     bool
		limit     *int
		room      int
		limited   bool
	}{
		{"oversell off", 5, false, nil, 5, true},
		{"oversell off, already negative", -2, false, nil, -2, true},
		{"unlimited", -50, true, nil, 0, false},
		{"limited", 2, true, &three, 5, true},
		{"limited, already at the limit", -3, true, &three, 0, true},
	}
	for _, c := range cases {
		room, limited := oversellRoom(c.available, c.allow, c.limit)
		if room != c.room || limited != c.limited {
			t.Errorf("%s: got (%d,%v), want (%d,%v)", c.name, room, limited, c.room, c.limited)
		}
	}
}

func TestSizeChartRowEmpty(t *testing.T) {
	if !(sizeChartRow{Size: "  ", Note: " "}).empty() {
		t.Fatal("blank row should count as empty")
	}
	if (sizeChartRow{Bust: "90"}).empty() {
		t.Fatal("row with a measurement is not empty")
	}
}

// TestOversellLimitAgainstDatabase: Available = Actual + Incoming - Ordered, Available - qty >= -X.
// Runs only with TEST_DATABASE_URL (see liveTestDB), inside a rolled-back transaction.
func TestOversellLimitAgainstDatabase(t *testing.T) {
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
	var productID, variantID int
	must(tx.QueryRow(ctx, `INSERT INTO products (name, sku) VALUES ('T-OVS', 'TOVS-ZZ') RETURNING id`).Scan(&productID))
	must(tx.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, color, size, price) VALUES ($1,'TOVS-ZZ-BLACK-M','黑','M',1) RETURNING id`, productID).Scan(&variantID))
	_, err = tx.Exec(ctx, `INSERT INTO stock_buckets (variant_id, available_stock, incoming_stock) VALUES ($1, 2, 1)
		ON CONFLICT (variant_id) DO UPDATE SET available_stock = 2, incoming_stock = 1`, variantID)
	must(err)
	check := func(qty int) string {
		t.Helper()
		msg, err := checkOversellLimitsTx(ctx, tx, []createOrderItem{{VariantID: variantID, Qty: qty}})
		must(err)
		return msg
	}
	set := func(allow bool, limit any) {
		t.Helper()
		_, err := tx.Exec(ctx, `UPDATE product_variants SET allow_oversell=$1, oversell_limit=$2 WHERE id=$3`, allow, limit, variantID)
		must(err)
	}

	set(false, nil) // Available 3, no oversell
	if msg := check(3); msg != "" {
		t.Fatalf("3 of 3 rejected: %s", msg)
	}
	if msg := check(4); !strings.Contains(msg, "TOVS-ZZ-BLACK-M") {
		t.Fatalf("4 of 3 accepted without oversell: %q", msg)
	}
	set(true, 2) // may go to -2
	if msg := check(5); msg != "" {
		t.Fatalf("5 within limit 2 rejected: %s", msg)
	}
	if msg := check(6); msg == "" {
		t.Fatal("6 past limit 2 accepted")
	}
	set(true, nil)
	if msg := check(500); msg != "" {
		t.Fatalf("unlimited rejected: %s", msg)
	}
	// already-ordered quantity counts against the limit
	var customerID, chainID, orderID int
	must(tx.QueryRow(ctx, `SELECT id FROM customers ORDER BY id LIMIT 1`).Scan(&customerID))
	must(tx.QueryRow(ctx, `SELECT id FROM pickup_chains ORDER BY id LIMIT 1`).Scan(&chainID))
	must(tx.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id) VALUES ('T-OVS-1',$1,$2) RETURNING id`, customerID, chainID).Scan(&orderID))
	_, err = tx.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,4,1)`, orderID, variantID)
	must(err)
	set(true, 2) // Available now 3 - 4 = -1, room 1
	if msg := check(1); msg != "" {
		t.Fatalf("1 within remaining room rejected: %s", msg)
	}
	if msg := check(2); msg == "" {
		t.Fatal("2 past remaining room accepted")
	}
}
