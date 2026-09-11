-- =========================================================
-- Split order: lets staff move a subset of an order's line items into
-- a brand-new order (same customer/pickup info) when they can't all
-- be fulfilled together.
-- =========================================================

ALTER TABLE orders ADD COLUMN parent_order_id INT REFERENCES orders(id);
CREATE INDEX idx_orders_parent ON orders(parent_order_id);
