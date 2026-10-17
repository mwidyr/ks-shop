-- Removes everything created by scripts/seed_export_test_orders.sql (orders whose order_no starts
-- with 'TST-', their items/logs/export history, their shipping batches and import issues, and the
-- dummy customers). Stock is NOT put back: the seed only raised Actual stock, and shipments of
-- test orders may have deducted some - fix stock by hand in Inventory if you care.
--   psql "$DATABASE_URL" -f scripts/clean_export_test_orders.sql
BEGIN;
CREATE TEMP TABLE _tst_customers AS
    SELECT DISTINCT customer_id AS id FROM orders WHERE order_no LIKE 'TST-%';
CREATE TEMP TABLE _tst_orders AS SELECT id FROM orders WHERE order_no LIKE 'TST-%';

DELETE FROM order_shipment_groups WHERE id IN (
    SELECT group_id FROM order_shipment_group_members WHERE order_id IN (SELECT id FROM _tst_orders));

-- Shipping Workbench tables (only present once migrations 092+ have run)
DO $$
BEGIN
    IF to_regclass('shipping_batch_orders') IS NOT NULL THEN
        DELETE FROM shipping_import_issues WHERE order_id IN (SELECT id FROM _tst_orders);
        DELETE FROM shipping_import_issues WHERE ref LIKE 'TST-%';
        DELETE FROM order_export_log WHERE order_id IN (SELECT id FROM _tst_orders);
        DELETE FROM shipping_batch_orders WHERE order_id IN (SELECT id FROM _tst_orders);
        -- batches left with no orders, and the import history that belonged to them
        DELETE FROM shipping_import_issues WHERE import_id IN (
            SELECT l.id FROM shipping_import_log l WHERE l.batch_id IN
                (SELECT b.id FROM shipping_batches b WHERE NOT EXISTS (SELECT 1 FROM shipping_batch_orders x WHERE x.batch_id = b.id)));
        DELETE FROM shipping_import_log WHERE batch_id IN
            (SELECT b.id FROM shipping_batches b WHERE NOT EXISTS (SELECT 1 FROM shipping_batch_orders x WHERE x.batch_id = b.id));
        DELETE FROM order_export_log WHERE batch_id IN
            (SELECT b.id FROM shipping_batches b WHERE NOT EXISTS (SELECT 1 FROM shipping_batch_orders x WHERE x.batch_id = b.id));
        DELETE FROM shipping_batches b WHERE NOT EXISTS (SELECT 1 FROM shipping_batch_orders x WHERE x.batch_id = b.id);
    END IF;
END $$;

DELETE FROM stock_movements  WHERE order_id IN (SELECT id FROM _tst_orders);
DELETE FROM returns          WHERE order_id IN (SELECT id FROM _tst_orders);
DELETE FROM order_items      WHERE order_id IN (SELECT id FROM _tst_orders);
DELETE FROM order_status_log WHERE order_id IN (SELECT id FROM _tst_orders);
DELETE FROM orders           WHERE order_no LIKE 'TST-%';   -- order_export_log cascades
DELETE FROM customers c USING _tst_customers t
 WHERE c.id = t.id AND (c.name ~ '^(Tes|測試|Dummy|假資料|Uji)' OR c.phone = '0912345678' OR c.phone LIKE '0900%')
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
COMMIT;
