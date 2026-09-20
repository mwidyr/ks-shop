-- Adds tab_key 'product_color_pair' for the new cross-product color-pair market-basket report
-- (pick two products, see which color combinations across them were bought together), granting
-- the same view access as the other analytics tabs (management/spv/sales).
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT r, 'product_color_pair', 'view' FROM unnest(ARRAY['management','spv','sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
