-- =========================================================
-- Items 040-045 / "Sales Channel & Sales Data Attribution" PDF: expand the
-- sales data structure from LIVE-only to ALL / LIVE / Website, so future
-- Website (and later Affiliate/Agent) sales share the same reporting model
-- as today's LIVE sales instead of needing a redesign later.
--
-- LIVE -> Location -> Host attribution is unchanged (existing hosts/
-- host_locations/order_items.host_id chain). Website -> Affiliate is new.
-- Sales Channel lives on the order (per spec); no per-item override is
-- needed at this stage for Website/Affiliate.
--
-- Every existing/new-by-default order defaults to 'live' - correct today
-- since every order is still created through the Host-required Order
-- Creation flow; there's no real website checkout in this codebase yet.
-- =========================================================

CREATE TABLE affiliates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN sales_channel VARCHAR(20) NOT NULL DEFAULT 'live';
ALTER TABLE orders ADD COLUMN affiliate_id INT REFERENCES affiliates(id);

CREATE INDEX idx_orders_sales_channel ON orders(sales_channel);

-- A Website order has no LIVE host at all - order_items.host_id (NOT NULL since 013) must
-- become optional. LIVE-specific handlers (heatmap/performance dashboard/host analytics) all
-- INNER JOIN hosts, so Website's NULL host_id rows are naturally excluded there without any
-- extra filtering; handlers already written defensively with LEFT JOIN + COALESCE (e.g.
-- reports.go's HostCategoryLeaderboard) already tolerate it.
ALTER TABLE order_items ALTER COLUMN host_id DROP NOT NULL;

-- Dedicated tab_key for the new Affiliates reference-list page, same access level as the
-- adjacent 'hosts' tab (036_role_tab_access.sql's pattern).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'management', 'affiliates', 'edit'
UNION ALL
SELECT r, 'affiliates', 'view' FROM unnest(ARRAY['spv', 'sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
