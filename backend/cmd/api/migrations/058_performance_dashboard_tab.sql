-- =========================================================
-- Performance Dashboard (item #007, phase 1 of 3): view access for the
-- roles that already see the store-wide Dashboard/Reports, same pattern
-- as 046_product_performance_tab.sql.
-- =========================================================

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'performance_dashboard', 'view' FROM unnest(ARRAY['management', 'spv', 'sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
