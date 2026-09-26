-- =========================================================
-- Follow-up to 065: two problems found while testing the Heatmap color
-- model on the VPS.
--
-- 1. The ALL/AVERAGE rows now use the same 5-level color scale as the main
--    grid (frontend fix, Heatmap.jsx), but with only 065's original random
--    seed there was no guarantee any single day/host/slot actually reached
--    every level - so the demo grid could look flat. Part 1 below plants
--    one host's row, on today's date, with 5 slots deliberately hit at
--    qty 2/5/8/12/16 - exactly one value per level under the "1 hari"
--    threshold table (1-2/3-5/6-8/9-12/13+), so opening the page on
--    "Hari Ini" always shows a clean 5-level gradient to check against.
--
-- 2. Real qty-per-slot from 065 alone may be too thin to reach the higher
--    levels under the 7/14/30-day threshold tables. Part 2 tops up every
--    live_sessions row 065 created with 8-20 more orders in the same
--    session window, so the wider-range views have enough volume to
--    naturally spread across all 5 levels too.
--
-- Per explicit product decision this session, it's fine for this to be
-- dated "live"/backdated data while the system is still in testing - use
-- a distinct order_no prefix ('ORD-LEVELTEST-'/'ORD-LIVE2-') so these rows
-- stay easy to identify and clean up later once real data takes over.
-- =========================================================

-- Part 1: guaranteed 5-level demo on today's date, one host, 5 slots.
DO $$
DECLARE
    demo_host_id INT; chain_id INT; cust_id INT; order_id INT; v_id INT; v_price NUMERIC;
    slot_targets INT[] := ARRAY[4, 10, 16, 22, 28];
    qty_targets INT[]  := ARRAY[2, 5, 8, 12, 16];
    i INT; target_qty INT; target_slot INT;
    slot_hour INT; slot_minute INT; base_ts TIMESTAMPTZ;
    remaining INT; this_qty INT; order_no TEXT; order_seq INT := 0;
BEGIN
    SELECT id INTO demo_host_id FROM hosts WHERE is_active = true ORDER BY id LIMIT 1;
    SELECT id INTO chain_id FROM pickup_chains WHERE is_active = true ORDER BY id LIMIT 1;
    SELECT id INTO cust_id FROM customers ORDER BY id LIMIT 1;

    IF demo_host_id IS NULL OR chain_id IS NULL OR cust_id IS NULL THEN
        RAISE NOTICE 'Skipping heatmap level-demo seed: missing base reference data';
        RETURN;
    END IF;

    FOR i IN 1..5 LOOP
        target_slot := slot_targets[i];
        target_qty := qty_targets[i];
        slot_hour := 6 + target_slot / 2;
        slot_minute := (target_slot % 2) * 30;
        -- Anchor to the exact wall-clock slot in Asia/Jakarta, regardless of the DB session's
        -- own timezone setting, since slotIndexExpr in heatmap.go reads AT TIME ZONE 'Asia/Jakarta'.
        base_ts := (CURRENT_DATE + make_time(slot_hour, slot_minute, 0)) AT TIME ZONE 'Asia/Jakarta';

        remaining := target_qty;
        WHILE remaining > 0 LOOP
            this_qty := LEAST(remaining, 1 + floor(random() * 3)::INT);
            remaining := remaining - this_qty;
            order_seq := order_seq + 1;
            order_no := 'ORD-LEVELTEST-' || order_seq;

            SELECT id, price INTO v_id, v_price FROM product_variants ORDER BY random() LIMIT 1;

            INSERT INTO orders (order_no, customer_id, status, shipping_address, pickup_chain_id, created_at, updated_at)
            VALUES (order_no, cust_id, 'delivered', (SELECT address FROM customers WHERE id = cust_id), chain_id, base_ts, base_ts)
            RETURNING id INTO order_id;

            INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id)
            VALUES (order_id, v_id, this_qty, v_price, demo_host_id);
        END LOOP;
    END LOOP;
END $$;

-- Part 2: top up every 065-seeded session with more orders, for 7/14/30-day realism.
DO $$
DECLARE
    cust_ids INT[]; chain_ids INT[]; variant_ids INT[];
    n_customers INT; n_chains INT; n_variants INT;
    sess RECORD;
    extra_orders INT; k INT; order_id INT; cust_id INT; chain_id INT; addr TEXT;
    order_created TIMESTAMPTZ; ord_status TEXT; order_no TEXT; order_seq INT := 0;
    items_in_order INT; m INT; v_id INT; v_price NUMERIC; qty INT;
    status_pool TEXT[] := ARRAY['delivered','delivered','delivered','shipped','shipped','picking','pending'];
BEGIN
    SELECT array_agg(id) INTO cust_ids FROM customers;
    SELECT array_agg(id) INTO chain_ids FROM pickup_chains WHERE is_active = true;
    SELECT array_agg(id) INTO variant_ids FROM product_variants;
    n_customers := array_length(cust_ids, 1);
    n_chains := array_length(chain_ids, 1);
    n_variants := array_length(variant_ids, 1);

    IF n_customers IS NULL OR n_chains IS NULL OR n_variants IS NULL THEN
        RAISE NOTICE 'Skipping heatmap volume top-up: missing base reference data';
        RETURN;
    END IF;

    FOR sess IN SELECT id, host_id, started_at, ended_at FROM live_sessions WHERE label LIKE 'Live Session %' LOOP
        extra_orders := 8 + floor(random() * 13)::INT;
        FOR k IN 1..extra_orders LOOP
            order_seq := order_seq + 1;
            cust_id := cust_ids[1 + (order_seq % n_customers)];
            chain_id := chain_ids[1 + (order_seq % n_chains)];
            SELECT address INTO addr FROM customers WHERE id = cust_id;
            order_created := sess.started_at + (random() * (sess.ended_at - sess.started_at));
            ord_status := status_pool[1 + floor(random() * array_length(status_pool, 1))::INT];
            order_no := 'ORD-LIVE2-' || order_seq;

            INSERT INTO orders (order_no, customer_id, status, shipping_address, pickup_chain_id, created_at, updated_at)
            VALUES (order_no, cust_id, ord_status, addr, chain_id, order_created, order_created)
            RETURNING id INTO order_id;

            items_in_order := 1 + floor(random() * 3)::INT;
            FOR m IN 1..items_in_order LOOP
                v_id := variant_ids[1 + floor(random() * n_variants)::INT];
                SELECT price INTO v_price FROM product_variants WHERE id = v_id;
                qty := 1 + floor(random() * 3)::INT;
                INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id, live_session_id)
                VALUES (order_id, v_id, qty, v_price, sess.host_id, sess.id);
            END LOOP;
        END LOOP;
    END LOOP;
END $$;
