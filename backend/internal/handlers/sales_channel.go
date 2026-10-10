package handlers

import (
	"net/http"
	"strconv"
)

// salesChannelWhere builds "AND {alias}.sales_channel = ... [AND {alias}.affiliate_id ...]"
// from ?channel=all|live|website (default "all") and, for Website, ?affiliate_id=<id>|cs|self_service|none, for handlers
// that aggregate plain orders/order_items data (items 040-045, Sales Channel Attribution).
// "all" (the default) adds no restriction at all - deliberately not gated on LIVE Data, per
// spec, unlike the LIVE-only "valid session" gate Performance Dashboard/Host Analytics use.
// alias is the orders table's alias in the query being built (usually "o"). startArg is the
// first free $N placeholder index.
func salesChannelWhere(r *http.Request, alias string, startArg int) (whereSQL string, args []interface{}) {
	n := startArg
	switch r.URL.Query().Get("channel") {
	case "live":
		whereSQL = " AND " + alias + ".sales_channel = 'live'"
	case "website":
		whereSQL = " AND " + alias + ".sales_channel = 'website'"
		// Every Website order is in exactly one category: an Affiliate, "Website - Created by CS"
		// (cs) or "Website - Self-Service" (self_service). "none" (= cs + self_service, no affiliate)
		// is kept for old links.
		switch aff := r.URL.Query().Get("affiliate_id"); aff {
		case "":
			// all Website sales
		case "none":
			whereSQL += " AND " + alias + ".affiliate_id IS NULL"
		case "cs":
			whereSQL += " AND " + alias + ".affiliate_id IS NULL AND COALESCE(" + alias + ".website_source, 'cs') = 'cs'"
		case "self_service":
			whereSQL += " AND " + alias + ".affiliate_id IS NULL AND " + alias + ".website_source = 'self_service'"
		default:
			// A Master Affiliate also owns the orders of its sub-affiliates (same roll-up as the
			// Performance Comparison page).
			args = append(args, aff)
			whereSQL += " AND " + alias + ".affiliate_id IN (SELECT id FROM affiliates WHERE id = $" + strconv.Itoa(n) + " OR parent_affiliate_id = $" + strconv.Itoa(n) + ")"
			n++
		}
	}
	return whereSQL, args
}
