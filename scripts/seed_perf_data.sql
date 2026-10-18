-- Volume data to measure list performance (Orders, Customers, Audit Log, Shipping Workbench ...).
-- Run MANUALLY on a dev / scratch database, never on production:
--   psql "$DATABASE_URL" -f scripts/seed_perf_data.sql
-- Remove again with scripts/clean_perf_data.sql.
--
-- Adds (all identifiable: order_no 'PERF-...', customer phone 0955xxxxxx):
--   5,000 customers, 20,000 orders over the last 120 days (mixed statuses and delivery methods),
--   ~40,000 order items, one status-log row per order, 20,000 stock movements.
-- Needs the demo data (product variants, hosts, pickup chains, a user). Refuses to run twice.

DO $$
DECLARE
    v_user INT;
    v_variants INT[];
    v_hosts INT[];
    v_chains INT[];
BEGIN
    IF EXISTS (SELECT 1 FROM orders WHERE order_no LIKE 'PERF-%') THEN
        RAISE EXCEPTION 'PERF- orders already exist; run scripts/clean_perf_data.sql first';
    END IF;
    SELECT id INTO v_user FROM users ORDER BY id LIMIT 1;
    SELECT array_agg(id) INTO v_variants FROM product_variants;
    SELECT array_agg(id) INTO v_hosts FROM hosts;
    SELECT array_agg(id) INTO v_chains FROM pickup_chains WHERE is_active;
    IF v_variants IS NULL OR v_hosts IS NULL OR v_chains IS NULL THEN
        RAISE EXCEPTION 'needs product variants, hosts and pickup chains (the demo data)';
    END IF;
    PERFORM setseed(0.37);

    INSERT INTO customers (name, phone, address)
    SELECT 'Perf ' || n, '0955' || lpad(n::text, 6, '0'), '' FROM generate_series(1, 5000) n;

    INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id,
                        pickup_store_name, pickup_store_code, internal_notes, sales_channel, shipping_fee, created_at)
    SELECT 'PERF-' || lpad(n::text, 6, '0'),
           (SELECT id FROM customers WHERE phone = '0955' || lpad((1 + (random() * 4999)::int)::text, 6, '0')),
           v_user,
           (ARRAY['pending','pending','processing','ready_to_ship','shipped','shipped','delivered','delivered','delivered','delivered','cancelled','return'])[1 + (random() * 11)::int],
           '', v_chains[1 + (random() * (array_length(v_chains, 1) - 1))::int],
           'Perf store', lpad((100000 + (random() * 899999)::int)::text, 6, '0'),
           '[PERF-DATA]', 'live', (ARRAY[0, 60, 60, 100])[1 + (random() * 3)::int],
           now() - (random() * interval '120 days')
    FROM generate_series(1, 20000) n;

    INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id)
    SELECT o.id, v_variants[1 + (random() * (array_length(v_variants, 1) - 1))::int],
           1 + (random() * 2)::int, 100 + (random() * 900)::int,
           v_hosts[1 + (random() * (array_length(v_hosts, 1) - 1))::int]
    FROM orders o, generate_series(1, 2) k
    WHERE o.order_no LIKE 'PERF-%' AND (k = 1 OR random() < 0.9);

    INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason, created_at)
    SELECT id, NULL, status, v_user, 'perf data', created_at FROM orders WHERE order_no LIKE 'PERF-%';

    INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note, created_at)
    SELECT i.variant_id, i.order_id, 'available_stock', '(shipped)', i.qty, 'perf_data', v_user, 'perf data', o.created_at
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.order_no LIKE 'PERF-%' AND random() < 0.5;
END $$;

ANALYZE orders; ANALYZE order_items; ANALYZE customers; ANALYZE order_status_log; ANALYZE stock_movements;
SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM order_items) AS items,
       (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM stock_movements) AS stock_movements;
