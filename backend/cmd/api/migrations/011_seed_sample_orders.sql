-- =========================================================
-- Replace leftover pre-pivot test order data with a clean,
-- correct sample dataset: host_id is now required on every
-- order item, and orders are spread across the last 30 days
-- (relative to whenever this migration runs) so the dashboard
-- graph, ranking, and revenue cards have data out of the box.
-- =========================================================

-- Wipe any existing transactional order data (test artifacts from
-- before the seller/host pivot) and reset stock to a clean baseline.
TRUNCATE stock_movements;
DELETE FROM orders; -- cascades order_items, order_status_log

UPDATE stock_buckets SET available_stock = 30 + (variant_id % 20), reserve_stock = 0, order_stock = 0, broken_stock = 0;

-- A few more sample customers for variety.
INSERT INTO customers (name, phone, address) VALUES
    ('Rian Pratama', '081311122233', 'Jl. Sudirman No. 20, Jakarta'),
    ('Maya Sari', '081422233344', 'Jl. Gatot Subroto No. 15, Bandung'),
    ('Dedi Kurniawan', '081533344455', 'Jl. Ahmad Yani No. 8, Surabaya');

-- Host attribution is no longer optional: every order item must have a host.
ALTER TABLE order_items ALTER COLUMN host_id SET NOT NULL;

DO $$
DECLARE
    cust_ids INT[]; host_ids INT[]; courier_ids INT[]; variant_ids INT[]; sales_ids INT[];
    n_customers INT; n_hosts INT; n_couriers INT; n_variants INT; n_sales INT;
    i INT; j INT; items_in_order INT;
    order_id INT; cust_id INT; host_id INT; courier_id INT; sales_id INT;
    days_ago INT; order_created TIMESTAMPTZ; status TEXT; order_no TEXT;
    statuses TEXT[] := ARRAY['pending','confirm','packing','picking','shipped','delivered','delivered','delivered','cancelled','return'];
    v_id INT; v_price NUMERIC; qty INT;
BEGIN
    SELECT array_agg(id) INTO cust_ids FROM customers;
    SELECT array_agg(id) INTO host_ids FROM hosts WHERE is_active = true;
    SELECT array_agg(id) INTO courier_ids FROM shipping_couriers WHERE is_active = true;
    SELECT array_agg(id) INTO variant_ids FROM product_variants;
    SELECT array_agg(u.id) INTO sales_ids FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sales' AND u.is_active = true;
    n_customers := array_length(cust_ids,1);
    n_hosts := array_length(host_ids,1);
    n_couriers := array_length(courier_ids,1);
    n_variants := array_length(variant_ids,1);
    n_sales := array_length(sales_ids,1);

    FOR i IN 1..18 LOOP
        cust_id := cust_ids[1 + (i % n_customers)];
        courier_id := courier_ids[1 + (i % n_couriers)];
        sales_id := sales_ids[1 + (i % n_sales)];
        -- first 7 orders land within the last week, the rest spread across the last month
        days_ago := CASE WHEN i <= 7 THEN i - 1 ELSE 6 + (i - 6) * 2 END;
        order_created := now() - (days_ago || ' days')::interval - (random() * interval '10 hours');
        status := statuses[1 + (i % array_length(statuses,1))];
        order_no := 'ORD-SEED-' || i;

        INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, shipping_courier_id, created_at, updated_at)
        VALUES (order_no, cust_id, sales_id, status,
                (SELECT address FROM customers WHERE id = cust_id), courier_id, order_created, order_created)
        RETURNING id INTO order_id;

        INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, created_at)
        VALUES (order_id, NULL, status, sales_id, order_created);

        items_in_order := 1 + (i % 2);
        FOR j IN 1..items_in_order LOOP
            v_id := variant_ids[1 + ((i * 3 + j) % n_variants)];
            host_id := host_ids[1 + ((i + j) % n_hosts)];
            qty := 1 + (j % 2);
            SELECT price INTO v_price FROM product_variants WHERE id = v_id;

            INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id)
            VALUES (order_id, v_id, qty, v_price, host_id);

            IF status IN ('pending','confirm','packing','picking','shipped') THEN
                UPDATE stock_buckets SET available_stock = GREATEST(available_stock - qty, 0), order_stock = order_stock + qty WHERE variant_id = v_id;
                INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, created_at)
                VALUES (v_id, order_id, 'available_stock', 'order_stock', qty, 'order_created', sales_id, order_created);
            ELSIF status = 'delivered' THEN
                UPDATE stock_buckets SET available_stock = GREATEST(available_stock - qty, 0) WHERE variant_id = v_id;
                INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, created_at)
                VALUES (v_id, order_id, 'available_stock', '(finalized)', qty, 'order_delivered', sales_id, order_created);
            ELSIF status = 'return' THEN
                UPDATE stock_buckets SET available_stock = GREATEST(available_stock - qty, 0), broken_stock = broken_stock + qty WHERE variant_id = v_id;
                INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, created_at)
                VALUES (v_id, order_id, 'available_stock', 'broken_stock', qty, 'order_return', sales_id, order_created);
            END IF;
            -- 'cancelled' orders net to zero stock effect (created then immediately cancelled), no bucket change needed.
        END LOOP;
    END LOOP;
END $$;
