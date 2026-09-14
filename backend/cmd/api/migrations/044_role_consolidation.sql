-- management/spv become edit-level across every tab management currently has any access to
-- (its existing view+edit rows already span the full set of non-super_user-exclusive tabs).
-- The Roles & Permissions screen itself stays super_user-exclusive (hardcoded bypass in
-- backend/internal/middleware/tabaccess.go, not table-driven) - this migration does not touch that.
UPDATE role_tab_access SET access_level = 'edit' WHERE role_name = 'management';

DELETE FROM role_tab_access WHERE role_name = 'spv';
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'spv', tab_key, 'edit' FROM role_tab_access WHERE role_name = 'management';

-- sales gets the same tab access as cs (edit on orders/picking/shipping/customers/returns/
-- refunds/panel_siaran, view on dashboard). This does NOT touch the separate "sales only sees
-- their own orders" business logic in order_merge.go and orders.go (hardcoded
-- claims.Role == "sales" scoping, independent of role_tab_access) - that stays in force exactly
-- as before this migration.
DELETE FROM role_tab_access WHERE role_name = 'sales';
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'sales', tab_key, access_level FROM role_tab_access WHERE role_name = 'cs';
