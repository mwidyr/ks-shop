-- Backfill a master SKU for every existing product that doesn't have one yet (e.g. anything
-- manually set already, like a product created after 038, is left untouched).
UPDATE products SET sku = 'PRD-' || LPAD(id::text, 4, '0') WHERE sku IS NULL;
