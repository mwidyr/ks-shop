-- Removes everything created by scripts/seed_export_test_orders.sql (orders whose order_no starts
-- with 'TST-', their items/logs/export history, and the dummy customers).
--   psql "$DATABASE_URL" -f scripts/clean_export_test_orders.sql
BEGIN;
CREATE TEMP TABLE _tst_customers AS
    SELECT DISTINCT customer_id AS id FROM orders WHERE order_no LIKE 'TST-%';
DELETE FROM order_shipment_groups WHERE id IN (
    SELECT group_id FROM order_shipment_group_members WHERE order_id IN (SELECT id FROM orders WHERE order_no LIKE 'TST-%'));
DELETE FROM order_items      WHERE order_id IN (SELECT id FROM orders WHERE order_no LIKE 'TST-%');
DELETE FROM order_status_log WHERE order_id IN (SELECT id FROM orders WHERE order_no LIKE 'TST-%');
DELETE FROM orders           WHERE order_no LIKE 'TST-%';   -- order_export_log cascades
DELETE FROM customers c USING _tst_customers t
 WHERE c.id = t.id AND (c.name ~ '^(Tes|測試|Dummy|假資料|Uji)' OR c.phone = '0912345678')
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
COMMIT;
