-- =========================================================
-- Replenishment Planning (replaces Purchase Alert): same access pattern
-- already used for suppliers/purchases - management and warehouse can
-- edit, spv/sales can view.
-- =========================================================

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'replenishment_planning', 'edit' FROM unnest(ARRAY['management', 'warehouse']) AS r
ON CONFLICT (role_name, tab_key) DO UPDATE SET access_level = 'edit';

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'replenishment_planning', 'view' FROM unnest(ARRAY['spv', 'sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
