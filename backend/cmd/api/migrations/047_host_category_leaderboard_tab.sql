-- Adds tab_key 'host_category_leaderboard' for the new Host x Category leaderboard report
-- (mirrors the client's QUEEN sheet), granting the same view access as the other analytics
-- tabs (management/spv/sales).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'host_category_leaderboard', 'view' FROM unnest(ARRAY['management','spv','sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
