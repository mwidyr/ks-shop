-- =========================================================
-- Product Management: brand, and the pricing fields needed
-- for real Profit Analytics (cost price) and price comparison
-- (compare-at price / "coret harga").
-- =========================================================

ALTER TABLE products ADD COLUMN brand VARCHAR(150);
ALTER TABLE product_variants ADD COLUMN cost_price NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN compare_at_price NUMERIC(14,2) NOT NULL DEFAULT 0;
