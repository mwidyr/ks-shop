-- =========================================================
-- Replace courier-delivery with minimarket-pickup fulfillment
-- (Indomaret/Alfamart/Kantor Pos/Lainnya), matching the seller's
-- actual fulfillment model. shipping_couriers becomes pickup_chains,
-- gaining a platform-fixed base_fee and a seller-editable target_fee
-- (the margin the seller charges on top is target_fee - base_fee).
-- =========================================================

ALTER TABLE shipping_couriers RENAME TO pickup_chains;
ALTER TABLE pickup_chains ADD COLUMN base_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE pickup_chains ADD COLUMN target_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE orders RENAME COLUMN shipping_courier_id TO pickup_chain_id;
ALTER TABLE orders ADD COLUMN pickup_store_name TEXT;
ALTER TABLE orders ADD COLUMN pickup_store_code TEXT;

-- Reassign any orders pointing at a courier we're dropping (AnterAja has no
-- Indonesian-minimarket equivalent) to "Kurir Toko" before renaming it to
-- "Lainnya", then remove the now-unused row.
UPDATE orders SET pickup_chain_id = (SELECT id FROM pickup_chains WHERE name = 'Kurir Toko')
    WHERE pickup_chain_id = (SELECT id FROM pickup_chains WHERE name = 'AnterAja');
DELETE FROM pickup_chains WHERE name = 'AnterAja';

UPDATE pickup_chains SET name = 'Indomaret',  base_fee = 9000, target_fee = 15000 WHERE name = 'JNE';
UPDATE pickup_chains SET name = 'Alfamart',   base_fee = 8500, target_fee = 15000 WHERE name = 'J&T';
UPDATE pickup_chains SET name = 'Kantor Pos', base_fee = 0,    target_fee = 0     WHERE name = 'SiCepat';
UPDATE pickup_chains SET name = 'Lainnya',    base_fee = 0,    target_fee = 0     WHERE name = 'Kurir Toko';

-- Shipping-margin settings (free-shipping thresholds + flat home-delivery fee),
-- read/written the same way as the existing profit fee-assumption settings.
INSERT INTO app_settings (key, value) VALUES
    ('free_shipping_threshold_minimarket', 150000),
    ('free_shipping_threshold_pos', 100000),
    ('home_delivery_flat_fee', 20000)
ON CONFLICT (key) DO NOTHING;
