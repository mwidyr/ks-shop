package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShippingExportHandler builds the two carrier export layouts the client actually uses today:
// Format A ("Penerima/Alamat/COD/Status") for home delivery ("Alamat Customer"/"Lainnya"), and
// Format B ("Pembeli/Toko/Nilai barang/Ongkir/Status") for minimarket pickup (7-Eleven/
// FamilyMart) - chain type is inferred by name, same as shipping_fee.go. Exact column names may
// still change (the client said the format may be adjusted later); the underlying data and the
// exported/tracking-number bookkeeping is the durable part.
type ShippingExportHandler struct {
	DB *pgxpool.Pool
}

type shippingExportRow struct {
	OrderID         int      `json:"order_id"`
	OrderNo         string   `json:"order_no"`
	CustomerName    string   `json:"customer_name"`
	CustomerPhone   string   `json:"customer_phone"`
	ShippingAddress string   `json:"shipping_address"`
	PickupChainName string   `json:"pickup_chain_name"`
	PickupStoreName string   `json:"pickup_store_name"`
	PickupStoreCode string   `json:"pickup_store_code"`
	IsHomeDelivery  bool     `json:"is_home_delivery"`
	ItemValue       float64  `json:"item_value"`
	ShippingFee     float64  `json:"shipping_fee"`
	TotalToPay      float64  `json:"total_to_pay"`
	Status          string   `json:"status"`
	ExportedAt      *string  `json:"exported_at"`
	TrackingNumber  *string  `json:"tracking_number"`
	GroupOrderNos   []string `json:"group_order_nos"`
}

// List returns orders eligible for shipping export (status ready_to_ship/shipped). By default
// already-exported+shipped orders are excluded (they can't be re-exported per the reference
// system's own wording); pass ?include_exported=true to still see them.
func (h *ShippingExportHandler) List(w http.ResponseWriter, r *http.Request) {
	where := " WHERE o.status IN ('ready_to_ship','shipped') "
	if r.URL.Query().Get("include_exported") != "true" {
		where += " AND NOT (o.status = 'shipped' AND o.exported_at IS NOT NULL) "
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT o.id, o.order_no, c.name, c.phone, o.shipping_address, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''),
		       COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id),0) - o.discount_amount + o.additional_amount,
		       CASE WHEN EXISTS (
		           SELECT 1 FROM order_shipment_group_members gm
		           JOIN order_shipment_groups g ON g.id = gm.group_id
		           WHERE gm.order_id = o.id AND g.shipping_fee_order_id != o.id
		       ) THEN 0 ELSE o.shipping_fee END,
		       o.status, o.exported_at, o.tracking_number,
		       COALESCE((
		           SELECT array_agg(o3.order_no) FROM order_shipment_group_members gm3
		           JOIN order_shipment_groups g3 ON g3.id = gm3.group_id
		           JOIN orders o3 ON o3.id = gm3.order_id
		           WHERE gm3.group_id = (SELECT group_id FROM order_shipment_group_members WHERE order_id = o.id)
		             AND o3.id != o.id
		       ), '{}')
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id`+where+`
		ORDER BY o.created_at DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch export rows")
		return
	}
	defer rows.Close()

	list := []shippingExportRow{}
	for rows.Next() {
		var row shippingExportRow
		var exportedAt *time.Time
		if err := rows.Scan(&row.OrderID, &row.OrderNo, &row.CustomerName, &row.CustomerPhone, &row.ShippingAddress,
			&row.PickupChainName, &row.PickupStoreName, &row.PickupStoreCode, &row.ItemValue, &row.ShippingFee,
			&row.Status, &exportedAt, &row.TrackingNumber, &row.GroupOrderNos); err != nil {
			continue
		}
		row.IsHomeDelivery = row.PickupChainName == "Alamat Customer" || row.PickupChainName == "Lainnya"
		row.TotalToPay = row.ItemValue + row.ShippingFee
		if exportedAt != nil {
			v := exportedAt.Format(time.RFC3339)
			row.ExportedAt = &v
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}

type markExportedRequest struct {
	OrderIDs []int `json:"order_ids"`
}

// MarkExported flags the given orders as exported (timestamp only - the tracking number, if
// any, is filled in separately once the carrier assigns one).
func (h *ShippingExportHandler) MarkExported(w http.ResponseWriter, r *http.Request) {
	var req markExportedRequest
	if err := decodeJSON(r, &req); err != nil || len(req.OrderIDs) == 0 {
		respondError(w, http.StatusBadRequest, "order_ids is required")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE orders SET exported_at = now() WHERE id = ANY($1)`, req.OrderIDs); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to mark orders as exported")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type updateTrackingNumberRequest struct {
	TrackingNumber string `json:"tracking_number"`
}

// UpdateTrackingNumber sets the carrier-assigned tracking number once known.
func (h *ShippingExportHandler) UpdateTrackingNumber(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updateTrackingNumberRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET tracking_number=$1 WHERE id=$2`, req.TrackingNumber, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save tracking number")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
