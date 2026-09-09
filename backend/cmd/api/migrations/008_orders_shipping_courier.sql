-- =========================================================
-- Replace the hardcoded shipping_method enum with a real,
-- manageable shipping courier reference.
-- =========================================================

ALTER TABLE orders ADD COLUMN shipping_courier_id INT REFERENCES shipping_couriers(id);

UPDATE orders SET shipping_courier_id = (SELECT id FROM shipping_couriers WHERE name = 'Kurir Toko');

ALTER TABLE orders ALTER COLUMN shipping_courier_id SET NOT NULL;
ALTER TABLE orders DROP COLUMN shipping_method;

CREATE INDEX idx_orders_courier ON orders(shipping_courier_id);
