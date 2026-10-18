-- Search: every product field is searched with ILIKE '%text%' (one character is enough), so the columns
-- added to the product / order / customer searches get trigram indexes. Same guard as 097: skipped
-- (not failed) when pg_trgm is not available.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm not available (%), skipping search trigram indexes', SQLERRM;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_products_sku_trgm        ON products USING gin (sku gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_vendor_sku_trgm ON products USING gin (vendor_sku gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_live_code_trgm  ON products USING gin (live_code gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_category_trgm   ON products USING gin (category gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_brand_trgm      ON products USING gin (brand gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_variants_sku_trgm        ON product_variants USING gin (sku gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_variants_color_trgm      ON product_variants USING gin (color gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_customers_address_trgm   ON customers USING gin (address gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_orders_ship_addr_trgm    ON orders USING gin (shipping_address gin_trgm_ops);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'could not create search trigram indexes (%)', SQLERRM;
END $$;
