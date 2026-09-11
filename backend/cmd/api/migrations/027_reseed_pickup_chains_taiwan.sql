-- =========================================================
-- Correct market: this business is Taiwan-based (NT$), not Indonesian
-- minimarket pickup. Rename pickup chains to the real carriers and reset
-- fees, which were seeded at IDR-scale values that are meaningless in NT$
-- - staff will fill in real NT$ figures via the existing Settings UI.
-- =========================================================

UPDATE pickup_chains SET name = '7-Eleven',        base_fee = 0, target_fee = 0 WHERE name = 'Indomaret';
UPDATE pickup_chains SET name = 'FamilyMart',      base_fee = 0, target_fee = 0 WHERE name = 'Alfamart';
UPDATE pickup_chains SET name = 'Alamat Customer', base_fee = 0, target_fee = 0 WHERE name = 'Kantor Pos';
-- 'Lainnya' stays as-is (generic catch-all, already 0/0).

UPDATE app_settings SET value = 0 WHERE key IN (
    'free_shipping_threshold_minimarket',
    'free_shipping_threshold_pos',
    'home_delivery_flat_fee'
);
