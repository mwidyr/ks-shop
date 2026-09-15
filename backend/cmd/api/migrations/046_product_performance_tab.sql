-- Adds tab_key 'product_performance' for the new per-product drill-down + combo/cross-sell
-- report (sibling of 'product_analytics', which already carries view access for the same
-- three roles below - management/spv/sales get read access to every real analytics tab today).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'product_performance', 'view' FROM unnest(ARRAY['management','spv','sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
