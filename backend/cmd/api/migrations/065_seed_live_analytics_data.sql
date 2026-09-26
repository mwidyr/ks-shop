-- =========================================================
-- Adjustment tracker items 023/024: Performance Dashboard and Host
-- Performance Analytics read correctly from live_sessions/order_items
-- today (both gate on live_sessions.live_data_recorded_at IS NOT NULL,
-- joined to order_items/orders by host_id) - they were just empty
-- because no live_sessions rows with LIVE Data existed yet. This seeds
-- ~45 days of realistic "ended" LIVE sessions (with LIVE Data filled in
-- and live_data_recorded_at set, so they count as valid) plus orders/
-- order_items attributed to each session's host, so Performance
-- Dashboard, Host Performance Analytics, and Heatmap all have data to
-- show immediately.
--
-- Deliberately additive only (no TRUNCATE/DELETE) - unlike the earlier
-- dev-only reseed migrations (011/013), real data already exists in
-- this environment. Per explicit product decision this session, this
-- seed data is NOT tagged or backdated for later removal - it mixes
-- into system-wide financial totals (Finance/Profit/Payouts) like any
-- other order.
--
-- Also deliberately skips stock_buckets/stock_movements bookkeeping -
-- orthogonal to the three analytics pages in scope here, and touching
-- real stock levels for synthetic orders would risk corrupting real
-- inventory numbers, unlike orders/order_items/live_sessions data.
-- =========================================================

DO $$
DECLARE
    cust_ids INT[]; chain_ids INT[]; variant_ids INT[]; host_ids INT[];
    n_customers INT; n_chains INT; n_variants INT; n_hosts INT;
    day_offset INT; h_idx INT; h_id INT; h_shift TEXT;
    session_date DATE; session_start TIMESTAMPTZ; session_end TIMESTAMPTZ; recorded_at TIMESTAMPTZ;
    session_id INT;
    views_v INT; uv_v INT; active_v INT;
    n_orders INT; k INT; order_id INT; cust_id INT; chain_id INT; addr TEXT;
    order_created TIMESTAMPTZ; ord_status TEXT; order_no TEXT; order_seq INT := 0;
    items_in_order INT; m INT; v_id INT; v_price NUMERIC; qty INT;
    order_total NUMERIC; order_qty INT;
    status_pool TEXT[] := ARRAY['delivered','delivered','delivered','shipped','shipped','picking','ready_to_ship','pending','cancelled','return'];
BEGIN
    SELECT array_agg(id) INTO cust_ids FROM customers;
    SELECT array_agg(id) INTO chain_ids FROM pickup_chains WHERE is_active = true;
    SELECT array_agg(id) INTO variant_ids FROM product_variants;
    SELECT array_agg(id) INTO host_ids FROM hosts WHERE is_active = true;
    n_customers := array_length(cust_ids, 1);
    n_chains := array_length(chain_ids, 1);
    n_variants := array_length(variant_ids, 1);
    n_hosts := array_length(host_ids, 1);

    IF n_customers IS NULL OR n_chains IS NULL OR n_variants IS NULL OR n_hosts IS NULL THEN
        RAISE NOTICE 'Skipping LIVE analytics seed: missing base reference data (customers/pickup_chains/product_variants/hosts)';
        RETURN;
    END IF;

    FOR day_offset IN 0..44 LOOP
        session_date := CURRENT_DATE - day_offset;
        FOR h_idx IN 1..n_hosts LOOP
            h_id := host_ids[h_idx];
            -- skip ~20% of host-days so the grid isn't unrealistically full every single day
            IF random() < 0.2 THEN CONTINUE; END IF;

            SELECT shift INTO h_shift FROM hosts WHERE id = h_id;
            session_start := session_date + (CASE h_shift
                WHEN 'morning' THEN TIME '09:00'
                WHEN 'middle'  THEN TIME '13:30'
                WHEN 'evening' THEN TIME '19:30'
                ELSE TIME '10:00' + (random() * interval '8 hours')
            END) + (random() * interval '20 minutes');
            session_end := session_start + interval '90 minutes' + (random() * interval '60 minutes');
            recorded_at := session_end + interval '10 minutes' + (random() * interval '20 minutes');

            views_v := 500 + floor(random() * 4500)::INT;
            uv_v := floor(views_v * (0.3 + random() * 0.3))::INT;
            active_v := floor(uv_v * (0.4 + random() * 0.3))::INT;

            INSERT INTO live_sessions (
                host_id, label, started_at, ended_at, status, created_at,
                views, uv, active_viewers, awt_seconds, pcu, acu,
                follows, chats, shares, likes, live_data_recorded_at
            ) VALUES (
                h_id, 'Live Session ' || to_char(session_date, 'YYYY-MM-DD'),
                session_start, session_end, 'ended', session_start,
                views_v, uv_v, active_v,
                30 + floor(random() * 180)::INT,
                floor(active_v * (0.2 + random() * 0.3))::INT,
                round((active_v * (0.1 + random() * 0.2))::NUMERIC, 2),
                floor(views_v * (0.01 + random() * 0.03))::INT,
                floor(views_v * (0.02 + random() * 0.05))::INT,
                floor(views_v * (0.005 + random() * 0.02))::INT,
                floor(views_v * (0.03 + random() * 0.08))::INT,
                recorded_at
            ) RETURNING id INTO session_id;

            n_orders := 3 + floor(random() * 6)::INT;
            FOR k IN 1..n_orders LOOP
                order_seq := order_seq + 1;
                cust_id := cust_ids[1 + (order_seq % n_customers)];
                chain_id := chain_ids[1 + (order_seq % n_chains)];
                SELECT address INTO addr FROM customers WHERE id = cust_id;
                order_created := session_start + (random() * (session_end - session_start));
                ord_status := status_pool[1 + floor(random() * array_length(status_pool, 1))::INT];
                order_no := 'ORD-LIVE-' || order_seq;

                INSERT INTO orders (order_no, customer_id, status, shipping_address, pickup_chain_id, created_at, updated_at)
                VALUES (order_no, cust_id, ord_status, addr, chain_id, order_created, order_created)
                RETURNING id INTO order_id;

                INSERT INTO order_status_log (order_id, status_from, status_to, created_at)
                VALUES (order_id, NULL, ord_status, order_created);

                order_total := 0;
                order_qty := 0;
                items_in_order := 1 + floor(random() * 3)::INT;
                FOR m IN 1..items_in_order LOOP
                    v_id := variant_ids[1 + floor(random() * n_variants)::INT];
                    SELECT price INTO v_price FROM product_variants WHERE id = v_id;
                    qty := 1 + floor(random() * 3)::INT;

                    INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id, live_session_id)
                    VALUES (order_id, v_id, qty, v_price, h_id, session_id);

                    order_total := order_total + v_price * qty;
                    order_qty := order_qty + qty;
                END LOOP;

                IF ord_status = 'return' THEN
                    INSERT INTO returns (order_id, reason, refund_type, stage, status, qty, amount, host_id, created_at, updated_at)
                    VALUES (order_id, 'change_of_mind', 'full', 6, 'completed', order_qty, order_total, h_id,
                            order_created + interval '1 day', order_created + interval '1 day');
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;
