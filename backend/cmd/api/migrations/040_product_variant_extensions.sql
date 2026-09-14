ALTER TABLE products ADD COLUMN vendor_sku VARCHAR(100);
ALTER TABLE products ADD COLUMN base_price NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Per-variant oversell flag: defaults from the parent product at creation time, then editable
-- independently. Backfill existing variants from their product's current flag so nothing that
-- was previously allowed to oversell silently loses that permission once PickItem's enforcement
-- moves from products.allow_oversell to this column.
ALTER TABLE product_variants ADD COLUMN allow_oversell BOOLEAN NOT NULL DEFAULT false;
UPDATE product_variants pv SET allow_oversell = p.allow_oversell FROM products p WHERE p.id = pv.product_id;
