-- =========================================================
-- Free shipping: store-wide thresholds already exist (app_settings), but
-- were never read anywhere in the order flow, and there was no per-order
-- manual override. Add the override column; the threshold/fee calculation
-- itself lives in shipping_fee.go.
-- =========================================================

ALTER TABLE orders ADD COLUMN free_shipping_override BOOLEAN NOT NULL DEFAULT false;
-- Stored (not purely computed) so it's a stable historical record on past orders and can be
-- shown directly in Shipping Data Export's "Ongkir" column without recomputing against
-- app_settings that may change later.
ALTER TABLE orders ADD COLUMN shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
