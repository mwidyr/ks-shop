-- =========================================================
-- Inventory Management: incoming stock (on the way from
-- supplier) and a minimum-stock threshold for low-stock alerts.
-- Available/reserve/broken stay staff-edited exactly as before.
-- =========================================================

ALTER TABLE stock_buckets ADD COLUMN incoming_stock INT NOT NULL DEFAULT 0;
ALTER TABLE stock_buckets ADD COLUMN minimum_stock INT NOT NULL DEFAULT 0;
