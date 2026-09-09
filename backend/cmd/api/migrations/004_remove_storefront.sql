-- =========================================================
-- Remove storefront / cart / checkout: this app is now an
-- internal-only seller & shop management tool, orders are
-- entered directly by staff instead of built via a cart.
-- =========================================================

ALTER TABLE orders DROP COLUMN cart_id;
DROP TABLE cart_items;
DROP TABLE carts;

-- Customer self-service login is removed; the customer record itself stays
-- (still needed for buyer name/phone/address on orders), just no more login.
-- Null out any historical FK references to that login (e.g. stock movements
-- logged while testing the old storefront) before deleting it, so the audit
-- trail rows themselves are preserved rather than blocking the delete.
UPDATE stock_movements SET user_id = NULL
    WHERE user_id = (SELECT id FROM users WHERE email = 'customer@demo.com');
UPDATE order_status_log SET changed_by = NULL
    WHERE changed_by = (SELECT id FROM users WHERE email = 'customer@demo.com');
UPDATE order_items SET host_sales_id = NULL
    WHERE host_sales_id = (SELECT id FROM users WHERE email = 'customer@demo.com');
DELETE FROM users WHERE email = 'customer@demo.com';
