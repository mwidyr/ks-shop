-- Cleanup of invalid data (run MANUALLY with psql, never from a migration):
--   dry run (default, rolls back, only prints what WOULD happen):
--     psql "$DATABASE_URL" -f scripts/cleanup_invalid_data.sql
--   apply:
--     psql "$DATABASE_URL" -v apply=1 -f scripts/cleanup_invalid_data.sql
--
-- 1. PRODUCTS with no image (no product_images row) OR with a category that is empty / not in
--    Manajemen Kategori are archived: deleted_at = now(), is_active = false (what the app's own
--    delete does for a product that has order history).
-- 2. ORDERS are set to 'cancelled' (the app has no "deleted" order state) when they are:
--    a. invalid for the logistics export (same rules as Export File Adjustments.pdf):
--         - customer name empty or > 10 English chars / 5 Chinese chars (CJK counts 2);
--         - 7-ELEVEN / FamilyMart: phone not 10 digits starting 09, or store code not 6 digits;
--         - POS / courier: address empty or > 50 characters, empty phone, order_no > 20 chars
--           or containing Chinese;
--         - total (products - discount + additional + shipping fee) > NT$20,000;
--    b. or contain an item of a product archived in step 1 ("product not valid").
--    Only ACTIVE orders are touched (pending / picking / ready_to_ship / shipped). delivered,
--    return and already cancelled orders are left alone: the app does not allow
--    delivered -> cancelled either, and their stock is already finalized.
--    Cancelling mirrors the app: the picked quantity goes back to available stock (+ a
--    stock_movements row), the promotion redemption is freed, and an order_status_log row is
--    written with the reason. Wallet balance / points used by member orders are NOT refunded
--    here - those orders are listed at the end so they can be refunded from the app.

\if :{?apply}
\else
\set apply 0
\endif

BEGIN;

-- ---------------------------------------------------------------- 1. products
CREATE TEMP TABLE _bad_products ON COMMIT DROP AS
SELECT p.id,
       NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id) AS no_image,
       (COALESCE(p.category, '') = '' OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = p.category)) AS bad_category
FROM products p
WHERE p.deleted_at IS NULL
  AND (NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
       OR COALESCE(p.category, '') = ''
       OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = p.category));

-- ---------------------------------------------------------------- 2. orders
CREATE TEMP TABLE _bad_orders ON COMMIT DROP AS
WITH o AS (
    SELECT o.id, o.order_no, o.status, o.member_id, o.wallet_balance_used, o.wallet_points_used,
           btrim(c.name) AS name, regexp_replace(c.phone, '\D', '', 'g') AS phone,
           COALESCE(o.pickup_store_code, '') AS store_code, COALESCE(o.shipping_address, '') AS address,
           pc.chain_type,
           COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id), 0)
             - o.discount_amount + o.additional_amount + o.shipping_fee AS total
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
    WHERE o.status IN ('pending', 'picking', 'ready_to_ship', 'shipped')
), cjk AS (
    SELECT o.*, char_length(name) + char_length(regexp_replace(name, '[^㐀-䶿一-鿿　-〿＀-￯]', '', 'g')) AS name_units
    FROM o
)
SELECT id, order_no, status, member_id, wallet_balance_used, wallet_points_used,
       concat_ws('; ',
         CASE WHEN name = '' THEN 'nama kosong' WHEN name_units > 10 THEN 'nama > 10 karakter (' || name_units || ')' END,
         CASE WHEN chain_type IN ('cvs_711', 'cvs_familymart') AND phone !~ '^09[0-9]{8}$' THEN 'HP bukan 10 digit 09xx' END,
         CASE WHEN chain_type IN ('cvs_711', 'cvs_familymart') AND store_code !~ '^[0-9]{6}$' THEN 'kode toko bukan 6 digit' END,
         CASE WHEN chain_type = 'courier' AND btrim(address) = '' THEN 'alamat kosong' END,
         CASE WHEN chain_type = 'courier' AND char_length(address) > 50 THEN 'alamat > 50 karakter' END,
         CASE WHEN chain_type = 'courier' AND phone = '' THEN 'HP kosong' END,
         CASE WHEN chain_type = 'courier' AND (char_length(order_no) > 20 OR order_no ~ '[㐀-䶿一-鿿]') THEN 'nomor order tidak valid untuk HCT' END,
         CASE WHEN total > 20000 THEN 'total NT$ ' || total::bigint || ' > 20.000' END
       ) AS reason
FROM cjk
WHERE name = '' OR name_units > 10
   OR (chain_type IN ('cvs_711', 'cvs_familymart') AND (phone !~ '^09[0-9]{8}$' OR store_code !~ '^[0-9]{6}$'))
   OR (chain_type = 'courier' AND (btrim(address) = '' OR char_length(address) > 50 OR phone = ''
                                   OR char_length(order_no) > 20 OR order_no ~ '[㐀-䶿一-鿿]'))
   OR total > 20000;

-- Active orders that contain an item of a product about to be archived.
-- (An order that is invalid AND has a bad product keeps a single row: its first reason.)
INSERT INTO _bad_orders (id, order_no, status, member_id, wallet_balance_used, wallet_points_used, reason)
SELECT o.id, o.order_no, o.status, o.member_id, o.wallet_balance_used, o.wallet_points_used,
       'produk tidak valid: ' || string_agg(DISTINCT p.name, ', ')
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN product_variants pv ON pv.id = oi.variant_id
JOIN _bad_products bp ON bp.id = pv.product_id
JOIN products p ON p.id = bp.id
WHERE o.status IN ('pending', 'picking', 'ready_to_ship', 'shipped')
  AND NOT EXISTS (SELECT 1 FROM _bad_orders b WHERE b.id = o.id)
GROUP BY o.id, o.order_no, o.status, o.member_id, o.wallet_balance_used, o.wallet_points_used;

\echo
\echo '=== ORDERS to cancel ==='
SELECT status, count(*) AS orders FROM _bad_orders GROUP BY status ORDER BY status;
SELECT order_no, status, reason FROM _bad_orders ORDER BY id LIMIT 30;
\echo '(first 30 shown)'

\echo
\echo '=== PRODUCTS to archive ==='
SELECT count(*) AS products, count(*) FILTER (WHERE no_image) AS no_image, count(*) FILTER (WHERE bad_category) AS bad_category FROM _bad_products;
SELECT p.id, p.sku, p.name, p.category, bp.no_image, bp.bad_category
FROM _bad_products bp JOIN products p ON p.id = bp.id ORDER BY p.id LIMIT 30;
\echo '(first 30 shown)'

-- ---------------------------------------------------------------- apply
-- Stock: only the picked part ever touched stock (same as the app's cancel).
UPDATE stock_buckets sb SET order_stock = sb.order_stock - x.picked, available_stock = sb.available_stock + x.picked
FROM (SELECT oi.variant_id, SUM(oi.picked_qty) AS picked
      FROM order_items oi JOIN _bad_orders b ON b.id = oi.order_id
      WHERE oi.picked_qty > 0 GROUP BY oi.variant_id) x
WHERE sb.variant_id = x.variant_id;

INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
SELECT oi.variant_id, oi.order_id, 'order_stock', 'available_stock', oi.picked_qty, 'order_cancelled', NULL, 'cleanup script: ' || b.reason
FROM order_items oi JOIN _bad_orders b ON b.id = oi.order_id WHERE oi.picked_qty > 0;

DELETE FROM promotion_redemptions WHERE order_id IN (SELECT id FROM _bad_orders);

INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
SELECT id, status, 'cancelled', NULL, 'cleanup script: ' || reason FROM _bad_orders;

UPDATE orders o SET status = 'cancelled', updated_at = now() FROM _bad_orders b WHERE o.id = b.id;

UPDATE products SET deleted_at = now(), is_active = false WHERE id IN (SELECT id FROM _bad_products);

\echo
\echo '=== Cancelled orders that used wallet balance / points (refund manually from the app) ==='
SELECT order_no, member_id, wallet_balance_used, wallet_points_used FROM _bad_orders
WHERE member_id IS NOT NULL AND (wallet_balance_used > 0 OR wallet_points_used > 0);

\if :apply
  \echo
  \echo '>>> APPLIED (COMMIT)'
  COMMIT;
\else
  \echo
  \echo '>>> DRY RUN - nothing saved. Re-run with -v apply=1 to apply.'
  ROLLBACK;
\endif
