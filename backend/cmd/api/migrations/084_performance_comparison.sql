-- Performance Comparison page: tab access (same roles as Performance Dashboard) and the
-- Master Affiliate / Sub-Affiliate structure. A NULL parent = Master Affiliate; every existing
-- affiliate stays a master. Master totals in the comparison table include their sub-affiliates.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'performance_comparison', 'view' FROM unnest(ARRAY['management', 'spv', 'sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;

ALTER TABLE affiliates ADD COLUMN parent_affiliate_id INT REFERENCES affiliates(id);
CREATE INDEX idx_affiliates_parent ON affiliates(parent_affiliate_id);
