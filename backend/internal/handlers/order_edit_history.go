package handlers

import (
	"context"
	"fmt"
	"strings"
)

// Order history: every edit of an order is written to activity_log (Log Audit) with one line per change, so the
// team can see who changed what. The same rows feed the "Riwayat Order" timeline on the order detail page.
const orderChangeSep = "\n"

// orderHistoryActions are the activity_log actions of an order that belong to the order history.
var orderHistoryActions = []string{"order_edited", "order_edited_after_shipped", "removed_from_batch", "attachment_deleted", "pickup_updated", "notes_updated", "promotions_updated", "return_received"}

func rupiahText(v float64) string { return fmt.Sprintf("NT$%.0f", v) }

func variantLabel(ctx context.Context, q rowQuerier, variantID int) string {
	var sku, name, color, size string
	err := q.QueryRow(ctx, `
		SELECT v.sku, p.name, COALESCE(v.color,''), COALESCE(v.size,'')
		FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id=$1`, variantID).Scan(&sku, &name, &color, &size)
	if err != nil {
		return fmt.Sprintf("#%d", variantID)
	}
	var opts []string
	for _, s := range []string{color, size} {
		if s != "" {
			opts = append(opts, s)
		}
	}
	label := sku + " " + name
	if len(opts) > 0 {
		label += " (" + strings.Join(opts, "/") + ")"
	}
	return label
}

func hostLabel(ctx context.Context, q rowQuerier, hostID int) string {
	if hostID == 0 {
		return "-"
	}
	var n string
	if q.QueryRow(ctx, `SELECT name FROM hosts WHERE id=$1`, hostID).Scan(&n) != nil {
		return fmt.Sprintf("#%d", hostID)
	}
	return n
}

func chainLabel(ctx context.Context, q rowQuerier, chainID int) string {
	var n string
	if q.QueryRow(ctx, `SELECT name FROM pickup_chains WHERE id=$1`, chainID).Scan(&n) != nil {
		return fmt.Sprintf("#%d", chainID)
	}
	return n
}

func changeLine(label, from, to string) string {
	if from == "" {
		from = "-"
	}
	if to == "" {
		to = "-"
	}
	return fmt.Sprintf("%s: %s → %s", label, from, to)
}

func joinChanges(c []string) string { return strings.Join(c, orderChangeSep) }
