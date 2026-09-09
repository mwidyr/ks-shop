-- =========================================================
-- Manual discount / additional charge on an order (e.g. bundle
-- discount, extra packaging fee), applied once to the whole
-- order total rather than per line item.
-- =========================================================

ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN additional_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
