-- =========================================================
-- Performance: indexes for the columns the admin lists join, filter and sort on.
-- Before this, order_items was indexed only by host_id and order_status_log / stock_movements by
-- nothing useful, so every Orders page, Ordered-stock calculation, Audit Log page and Shipping
-- Workbench issue scanned whole tables. All statements are idempotent (IF NOT EXISTS).
-- Plain CREATE INDEX (not CONCURRENTLY): the migration runner executes a file as one batch; the
-- tables are small enough that the brief write lock is a matter of seconds.
-- =========================================================

-- orders: default sort, status tabs, customer history, sales-role filter
CREATE INDEX IF NOT EXISTS idx_orders_created_at       ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created   ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sales            ON orders (sales_id);

-- order_items: every order query joins on order_id; Ordered stock and allocation use variant_id
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items (order_id) INCLUDE (qty, price_at_order, variant_id, host_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant  ON order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_session  ON order_items (live_session_id) WHERE live_session_id IS NOT NULL;

-- logs: Audit Log pages and the "since when" timers of the Shipping Workbench issues
CREATE INDEX IF NOT EXISTS idx_order_status_log_order   ON order_status_log (order_id, status_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_log_created ON order_status_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created  ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order    ON stock_movements (order_id) WHERE order_id IS NOT NULL;

-- catalog / purchasing / misc list sorts
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_products_category        ON products (category);
CREATE INDEX IF NOT EXISTS idx_purchase_items_variant   ON purchase_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status         ON purchases (status);
CREATE INDEX IF NOT EXISTS idx_purchases_created        ON purchases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_suppliers_purchase    ON purchase_requisition_suppliers (purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_returns_created          ON returns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_created    ON live_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_created          ON members (created_at DESC);

-- ILIKE '%text%' searches cannot use a btree; trigram GIN indexes can. The extension ships with
-- the postgres image (contrib); if a managed database refuses it, only these indexes are skipped.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm not available (%), skipping trigram indexes', SQLERRM;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_customers_name_trgm     ON customers USING gin (name gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm    ON customers USING gin (phone gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_orders_order_no_trgm    ON orders USING gin (order_no gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_orders_platform_trgm    ON orders USING gin (platform_order_no gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_orders_tracking_trgm    ON orders USING gin (tracking_number gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_name_trgm      ON products USING gin (name gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_products_names_search_trgm ON products USING gin (names_search gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm     ON suppliers USING gin (name gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_members_name_trgm       ON members USING gin (name gin_trgm_ops);
    END IF;
END $$;

ANALYZE orders;
ANALYZE order_items;
ANALYZE order_status_log;
ANALYZE stock_movements;
