package handlers

import (
	"net/http"
	"testing"
)

func TestAvailableStock(t *testing.T) {
	cases := []struct {
		name                      string
		actual, incoming, ordered int
		want                      int
	}{
		{"initial", 100, 0, 0, 100},
		{"customer orders 1", 100, 0, 1, 99},
		{"purchase order confirmed", 100, 20, 0, 120},
		{"order against incoming", 100, 20, 1, 119},
		{"incoming received: moves between columns", 120, 0, 1, 119},
		{"oversold is negative", 5, 0, 8, -3},
	}
	for _, c := range cases {
		if got := availableStock(c.actual, c.incoming, c.ordered); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestCheckStatusChange(t *testing.T) {
	cases := []struct {
		name                string
		role, from, to      string
		reason              string
		exported, confirmed bool
		wantCode            int
	}{
		{"cs cancels a New order", "cs", "pending", "cancelled", "customer asked", false, false, 0},
		{"cancel needs a reason", "cs", "pending", "cancelled", "", false, false, http.StatusBadRequest},
		{"cs cannot cancel an exported Processing order", "cs", "processing", "cancelled", "x", true, true, http.StatusForbidden},
		{"cs cannot cancel Processing even if not flagged exported", "cs", "processing", "cancelled", "x", false, true, http.StatusForbidden},
		{"warehouse must confirm shipment stopped", "warehouse", "processing", "cancelled", "x", true, false, http.StatusBadRequest},
		{"warehouse cancels Processing after confirming", "warehouse", "processing", "cancelled", "x", true, true, 0},
		{"super_user cancels Ready to Ship after confirming", "super_user", "ready_to_ship", "cancelled", "x", true, true, 0},
		{"shipped cannot be cancelled", "super_user", "shipped", "cancelled", "x", true, true, http.StatusBadRequest},
		{"shipped goes to return", "cs", "shipped", "return", "damaged", false, false, 0},
		{"nobody sets Processing by hand", "super_user", "pending", "processing", "", false, false, http.StatusBadRequest},
		{"nobody sets Ready to Ship by hand", "super_user", "processing", "ready_to_ship", "", true, false, http.StatusBadRequest},
		{"cs cannot mark shipped", "cs", "ready_to_ship", "shipped", "", false, false, http.StatusForbidden},
		{"warehouse can mark shipped (fallback)", "warehouse", "ready_to_ship", "shipped", "", true, false, 0},
		{"warehouse can mark completed (fallback)", "warehouse", "shipped", "delivered", "", true, false, 0},
	}
	for _, c := range cases {
		code, msg := checkStatusChange(c.role, c.from, c.to, c.reason, c.exported, c.confirmed)
		if code != c.wantCode {
			t.Errorf("%s: got code %d (%q), want %d", c.name, code, msg, c.wantCode)
		}
	}
}
