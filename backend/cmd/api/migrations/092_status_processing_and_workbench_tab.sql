-- =========================================================
-- Shipping Workbench, step 1: the Picking List is retired.
--   * orders.status 'picking' becomes 'processing' (an order is Processing once its batch's
--     initial shipping Excel has been exported). No CHECK constraint exists on orders.status,
--     and order_status_log history is left untouched (audit-trail integrity).
--   * the 'picking' sidebar tab goes away; a new 'shipping_workbench' tab is added, editable by
--     warehouse only (super_user bypasses the tab middleware).
-- =========================================================

UPDATE orders SET status = 'processing' WHERE status = 'picking';

DELETE FROM role_tab_access WHERE tab_key = 'picking';

INSERT INTO role_tab_access (role_name, tab_key, access_level)
VALUES ('warehouse', 'shipping_workbench', 'edit')
ON CONFLICT (role_name, tab_key) DO UPDATE SET access_level = 'edit';
