-- =========================================================
-- Real Role & Permission enforcement, replacing the inert framework from
-- 033_role_permissions.sql (never wired to actual route gating - confirmed
-- via audit). Access is per sidebar "tab" (one row per nav item key from
-- AppShell.jsx's navGroups) rather than the old fine-grained action list,
-- with three levels: none (default, no row) / view / edit.
--
-- super_user ("Admin") is not represented here at all - the enforcement
-- middleware special-cases it to always pass, matching "Admin can do all
-- the stuff" as an invariant, not a configurable cell.
--
-- Adds two new roles the client's own requirement names explicitly: 'cs'
-- (Customer Service) and 'warehouse'. Existing roles (management, spv,
-- sales) are seeded to reproduce their current real access level, so
-- existing staff aren't suddenly locked out by this migration.
-- =========================================================

DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;

INSERT INTO roles (name) VALUES ('cs'), ('warehouse') ON CONFLICT (name) DO NOTHING;

CREATE TABLE role_tab_access (
    role_name VARCHAR(30) NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
    tab_key VARCHAR(60) NOT NULL,
    access_level VARCHAR(10) NOT NULL DEFAULT 'view', -- view | edit (rows are only inserted for view/edit; absence = none)
    PRIMARY KEY (role_name, tab_key)
);

-- management: edit on everything it can already write today (catalogWriteRoles), view on
-- everything else real plus every mock/inert tab (matches today's unrestricted read access).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'management', tab, 'edit' FROM unnest(ARRAY[
    'products','categories','hosts','shipping_settings','suppliers','purchases','fees','inventory','settings'
]) AS tab
UNION ALL
SELECT 'management', tab, 'view' FROM unnest(ARRAY[
    'dashboard','panel_siaran','orders','picking','shipping','customers','purchase_alert','product_analytics','profit','reports','audit_logs',
    'chat','reviews','warehouses','returns','refunds','promotions','campaigns','advertising','sales_analytics','transactions','payouts',
    'store_profile','store_design','notifications','integrations'
]) AS tab;

-- spv, sales: view-only on everything real (including what management can edit) plus every
-- mock tab - reproduces their current real restriction level (no write access anywhere).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, tab, 'view' FROM unnest(ARRAY['spv','sales']) AS r, unnest(ARRAY[
    'products','categories','hosts','shipping_settings','suppliers','purchases','fees','inventory','settings',
    'dashboard','panel_siaran','orders','picking','shipping','customers','purchase_alert','product_analytics','profit','reports','audit_logs',
    'chat','reviews','warehouses','returns','refunds','promotions','campaigns','advertising','sales_analytics','transactions','payouts',
    'store_profile','store_design','notifications','integrations'
]) AS tab;

-- cs (new): edit on Ordering-related tabs, view on dashboard, none elsewhere.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'cs', tab, 'edit' FROM unnest(ARRAY[
    'orders','picking','shipping','customers','returns','refunds','panel_siaran'
]) AS tab
UNION ALL
SELECT 'cs', 'dashboard', 'view';

-- warehouse (new): edit on Inventory-related tabs, view on dashboard, none elsewhere.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'warehouse', tab, 'edit' FROM unnest(ARRAY[
    'products','categories','inventory','warehouses','suppliers','purchases','purchase_alert'
]) AS tab
UNION ALL
SELECT 'warehouse', 'dashboard', 'view';
