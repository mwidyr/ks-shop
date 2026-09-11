-- =========================================================
-- Order status simplification: client wants New -> Picking -> Ready to
-- Ship (Picked) -> Shipped -> Completed, with no separate confirm/approval
-- step. 'confirm' and 'packing' are removed from the status vocabulary
-- (validTransitions in orders.go); a new 'ready_to_ship' stage is inserted
-- between 'picking' and 'shipped'. No DB-level CHECK constraint exists on
-- orders.status (validation is app-level only), so this is a pure data
-- backfill - historical order_status_log rows referencing 'confirm'/
-- 'packing' are left untouched (audit-trail integrity).
-- =========================================================

WITH migrated AS (
    SELECT id, status AS old_status FROM orders WHERE status IN ('confirm', 'packing')
)
INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
    SELECT id, old_status, 'picking', NULL, 'system: confirm/packing merged into picking (status model v2)'
    FROM migrated;

UPDATE orders SET status = 'picking' WHERE status IN ('confirm', 'packing');
