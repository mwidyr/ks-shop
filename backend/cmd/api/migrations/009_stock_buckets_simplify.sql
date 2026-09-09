-- =========================================================
-- Simplify stock buckets to what the product page actually
-- manages: available_stock, reserve_stock, broken_stock
-- (staff-editable) and order_stock (system-managed).
-- total_stock = available_stock + reserve_stock + broken_stock
-- (order_stock stays excluded: it's stock already committed
-- to a non-final order, no longer part of the sellable pool).
-- =========================================================

ALTER TABLE stock_buckets DROP COLUMN promo_stock;
ALTER TABLE stock_buckets DROP COLUMN safety_stock;
