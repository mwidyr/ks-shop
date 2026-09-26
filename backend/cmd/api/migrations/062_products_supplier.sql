-- =========================================================
-- "Each Product Code belongs to one Supplier. If the Supplier changes, a
-- new Product Code should be created instead of replacing the original
-- Supplier" (confirmed with client: a genuinely new product record -
-- new code, images, name). So this FK is effectively set once at product
-- creation; the UI never offers "change supplier" on an existing product.
-- =========================================================

ALTER TABLE products ADD COLUMN supplier_id INT REFERENCES suppliers(id);
CREATE INDEX idx_products_supplier ON products(supplier_id);

-- Purchase Rules, product-level override. Takes priority over the
-- supplier's own defaults (061_suppliers_profile.sql) when both are set.
CREATE TABLE product_purchase_rules (
    product_id INT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    min_order_qty INT,
    min_color_qty INT,
    min_order_amount NUMERIC(14,2),
    order_multiple INT,
    mixed_color_allowed BOOLEAN,
    pack_set_qty INT
);
