-- =========================================================
-- Host Performance Analytics + Heatmap (item #007, phases 2 & 3): view access
-- for the same roles that already see Performance Dashboard.
-- =========================================================

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, tab, 'view' FROM unnest(ARRAY['management', 'spv', 'sales']) AS r,
     unnest(ARRAY['host_performance_analytics', 'heatmap']) AS tab
ON CONFLICT (role_name, tab_key) DO NOTHING;
