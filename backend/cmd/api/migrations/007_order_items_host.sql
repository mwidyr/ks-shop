-- =========================================================
-- Order items now attribute sales to a Host (live seller),
-- not to an internal sales user.
-- =========================================================

ALTER TABLE order_items ADD COLUMN host_id INT REFERENCES hosts(id);
ALTER TABLE order_items DROP COLUMN host_sales_id;

CREATE INDEX idx_order_items_host ON order_items(host_id);
