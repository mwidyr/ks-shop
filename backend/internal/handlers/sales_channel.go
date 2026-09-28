package handlers

import (
	"net/http"
	"strconv"
)

// salesChannelWhere builds "AND {alias}.sales_channel = ... [AND {alias}.affiliate_id ...]"
// from ?channel=all|live|website (default "all") and ?affiliate_id=<id>|none, for handlers
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
		switch aff := r.URL.Query().Get("affiliate_id"); aff {
		case "":
			// no affiliate filter
		case "none":
			whereSQL += " AND " + alias + ".affiliate_id IS NULL"
		default:
			args = append(args, aff)
			whereSQL += " AND " + alias + ".affiliate_id = $" + strconv.Itoa(n)
			n++
		}
	}
	return whereSQL, args
}
