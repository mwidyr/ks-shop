-- =========================================================
-- Shipping Workbench, step 2: stock follows the client's definitions.
--   Actual    = physical stock in the warehouse (stock_buckets.available_stock is re-read as this)
--   Incoming  = purchased, not yet received (stock_buckets.incoming_stock, unchanged)
--   Ordered   = customer qty not yet shipped (DERIVED from orders, never stored)
--   Available = Actual + Incoming - Ordered
-- Actual only drops when the 3PL confirms shipment. The old pick-time bucket (order_stock) is
-- no longer used: goods that were "picked" are still physically in the warehouse, so they go
-- back into Actual and order_stock is zeroed.
-- =========================================================

UPDATE stock_buckets SET available_stock = available_stock + order_stock, order_stock = 0
WHERE order_stock <> 0;

-- A shipment deducts Actual exactly once per (order, variant), however often the confirmation
-- file is imported. Same for restocking a received return.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_once
    ON stock_movements (order_id, variant_id, event_type)
    WHERE event_type IN ('shipment_deducted', 'return_restocked', 'return_broken');
