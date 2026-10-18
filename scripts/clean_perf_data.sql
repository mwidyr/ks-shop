-- Removes everything created by scripts/seed_perf_data.sql.
--   psql "$DATABASE_URL" -f scripts/clean_perf_data.sql
BEGIN;
CREATE TEMP TABLE _perf_orders AS SELECT id FROM orders WHERE order_no LIKE 'PERF-%';
DELETE FROM stock_movements  WHERE order_id IN (SELECT id FROM _perf_orders);
DELETE FROM order_items      WHERE order_id IN (SELECT id FROM _perf_orders);
DELETE FROM order_status_log WHERE order_id IN (SELECT id FROM _perf_orders);
DELETE FROM orders           WHERE order_no LIKE 'PERF-%';
DELETE FROM customers c WHERE c.phone LIKE '0955%' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
COMMIT;
