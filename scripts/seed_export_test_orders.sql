-- Dummy orders to test the logistics export/import flow (7-ELEVEN, FamilyMart, HCT/POS).
-- Run MANUALLY, never from a migration:
--   psql "$DATABASE_URL" -f scripts/seed_export_test_orders.sql
-- Remove them again with scripts/clean_export_test_orders.sql.
--
-- Creates 300 pending orders: 100 per method (7-ELEVEN, FamilyMart, POS home delivery).
--  * dummy data only; every order is identifiable: order_no 'TST-...', customer phone 0900xxxxxx
--    (except the blacklist-test phone), internal note '[TEST-EXPORT]';
--  * each order's total (products + shipping fee) stays far below NT$20,000;
--  * 7-ELEVEN and FamilyMart: a few orders have a store code that does NOT exist (999xxx);
--  * 7-ELEVEN: a few orders use phone 0912345678 (blacklisted by the 7-ELEVEN system);
--  * shipping fee follows the real rules: 60 for minimarket, 100 for POS, 0 once the subtotal
--    reaches the configured free-shipping threshold (read from app_settings);
--  * no date restrictions - all orders are created "now" so they can be exported right away.
-- Safe to run more than once: it refuses to run while TST- orders still exist.

DO $$
DECLARE
    v_user      INT;
    v_chain     INT;
    v_ctype     TEXT;
    v_fee_flat  NUMERIC;
    v_thr_mini  NUMERIC := COALESCE((SELECT value::numeric FROM app_settings WHERE key = 'free_shipping_threshold_minimarket'), 1500);
    v_thr_pos   NUMERIC := COALESCE((SELECT value::numeric FROM app_settings WHERE key = 'free_shipping_threshold_pos'), 1500);
    v_variants  INT[];
    v_hosts     INT[];
    v_stores    TEXT[];
    v_names     TEXT[] := ARRAY['Tes','測試','Dummy','假資料','Uji'];
    i           INT;
    k           INT;
    n_items     INT;
    v_cust      INT;
    v_cust_bl   INT;
    v_phone     TEXT;
    v_name      TEXT;
    v_code      TEXT;
    v_store     TEXT;
    v_addr      TEXT;
    v_order     INT;
    v_sub       NUMERIC;
    v_price     NUMERIC;
    v_fee       NUMERIC;
    v_big       BOOLEAN;
    v_type      TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM orders WHERE order_no LIKE 'TST-%') THEN
        RAISE EXCEPTION 'TST- test orders already exist; run scripts/clean_export_test_orders.sql first';
    END IF;
    SELECT id INTO v_user FROM users ORDER BY id LIMIT 1;
    SELECT array_agg(id) INTO v_variants FROM product_variants;
    SELECT array_agg(id) INTO v_hosts FROM hosts;
    IF v_variants IS NULL OR v_hosts IS NULL THEN RAISE EXCEPTION 'needs at least one product variant and one host'; END IF;
    -- One customer (the blacklisted phone) is shared by several 7-ELEVEN orders.
    INSERT INTO customers (name, phone, address) VALUES ('Tes Blk', '0912345678', '') RETURNING id INTO v_cust_bl;
    PERFORM setseed(0.42);

    FOREACH v_type IN ARRAY ARRAY['cvs_711','cvs_familymart','courier'] LOOP
        IF v_type = 'courier' THEN
            SELECT id INTO v_chain FROM pickup_chains WHERE chain_type = 'courier' AND is_active ORDER BY id LIMIT 1;
            v_fee_flat := COALESCE((SELECT value::numeric FROM app_settings WHERE key = 'home_delivery_flat_fee'), 100);
        ELSE
            SELECT id INTO v_chain FROM pickup_chains WHERE chain_type = v_type AND is_active ORDER BY id LIMIT 1;
            v_fee_flat := 60;
        END IF;
        IF v_chain IS NULL THEN RAISE EXCEPTION 'no active pickup chain of type %', v_type; END IF;
        -- Real, existing store codes when the ECPay directory is loaded; otherwise made-up 6-digit ones.
        SELECT array_agg(store_code || '|' || store_name) INTO v_stores
        FROM (SELECT store_code, store_name FROM cvs_stores WHERE chain_type = v_type AND store_code ~ '^[0-9]{6}$' ORDER BY random() LIMIT 40) s;

        FOR i IN 1..100 LOOP
            v_name := v_names[1 + (i % 5)] || lpad(i::text, 2, '0');           -- max 4 CJK + 2 digits = 10 units
            v_phone := '0900' || lpad((CASE v_type WHEN 'cvs_711' THEN 100000 WHEN 'cvs_familymart' THEN 200000 ELSE 300000 END + i)::text, 6, '0');
            v_code := ''; v_store := ''; v_addr := '';
            v_cust := NULL;

            IF v_type = 'courier' THEN
                v_addr := '台北市中山區測試路' || i || '號' || (i % 9 + 1) || '樓';
            ELSIF i % 20 = 7 THEN                                               -- 5 orders per chain: store code that does not exist
                v_code := '999' || lpad(i::text, 3, '0'); v_store := '不存在門市'; v_addr := v_store || ' ' || v_code;
            ELSE
                IF v_stores IS NOT NULL THEN
                    v_code := split_part(v_stores[1 + (i % array_length(v_stores, 1))], '|', 1);
                    v_store := split_part(v_stores[1 + (i % array_length(v_stores, 1))], '|', 2);
                ELSE
                    v_code := '131' || lpad(i::text, 3, '0'); v_store := '測試門市';
                END IF;
                v_addr := v_store || ' ' || v_code;
            END IF;

            IF v_type = 'cvs_711' AND i % 20 = 3 THEN                           -- 5 orders: blacklisted phone
                v_cust := v_cust_bl;
            ELSE
                INSERT INTO customers (name, phone, address) VALUES (v_name, v_phone, '') RETURNING id INTO v_cust;
            END IF;

            v_big := (i % 4 = 0);                                               -- every 4th order is big enough to reach free shipping
            INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id,
                                pickup_store_name, pickup_store_code, internal_notes, sales_channel, shipping_fee)
            VALUES ('TST-' || CASE v_type WHEN 'cvs_711' THEN '711' WHEN 'cvs_familymart' THEN 'FM' ELSE 'POS' END || '-' || lpad(i::text, 3, '0'),
                    v_cust, v_user, 'pending', v_addr, v_chain, v_store, v_code, '[TEST-EXPORT]', 'live', 0)
            RETURNING id INTO v_order;
            INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
            VALUES (v_order, NULL, 'pending', v_user, 'test data');

            n_items := 1 + (i % 2);
            v_sub := 0;
            FOR k IN 1..n_items LOOP
                v_price := CASE WHEN v_big THEN 1500 + (random() * 1500)::int ELSE 100 + (random() * 400)::int END;
                INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id)
                VALUES (v_order, v_variants[1 + (random() * (array_length(v_variants, 1) - 1))::int], CASE WHEN v_big THEN 1 ELSE 1 + (random() * 1)::int END, v_price,
                        v_hosts[1 + (random() * (array_length(v_hosts, 1) - 1))::int]);
            END LOOP;
            SELECT SUM(qty * price_at_order) INTO v_sub FROM order_items WHERE order_id = v_order;
            v_fee := CASE WHEN v_type = 'courier'
                          THEN CASE WHEN v_thr_pos  > 0 AND v_sub >= v_thr_pos  THEN 0 ELSE v_fee_flat END
                          ELSE CASE WHEN v_thr_mini > 0 AND v_sub >= v_thr_mini THEN 0 ELSE v_fee_flat END END;
            UPDATE orders SET shipping_fee = v_fee WHERE id = v_order;
        END LOOP;
    END LOOP;
END $$;

SELECT pc.chain_type, count(*) AS orders, count(*) FILTER (WHERE o.shipping_fee = 0) AS free_shipping,
       max(COALESCE((SELECT SUM(qty * price_at_order) FROM order_items WHERE order_id = o.id), 0) + o.shipping_fee) AS max_total
FROM orders o JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
WHERE o.order_no LIKE 'TST-%' GROUP BY 1 ORDER BY 1;
