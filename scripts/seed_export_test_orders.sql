-- Dummy orders to test the logistics export/import flow (7-ELEVEN, FamilyMart, HCT/POS).
-- Run MANUALLY, never from a migration:
--   psql "$DATABASE_URL" -f scripts/seed_export_test_orders.sql
-- Remove them again with scripts/clean_export_test_orders.sql.
--
-- Creates 300 pending orders: 100 per method (7-ELEVEN, FamilyMart, POS home delivery).
--  * dummy data only; every order is identifiable: order_no 'TST-...', customer phone 0900xxxxxx
--    (except the blacklist-test phone), internal note '[TEST-EXPORT]';
--  * customer names are short English first names without digits (Anna, Lisa, Maya, ...);
--  * each order's total (products + shipping fee) stays far below NT$20,000;
--  * 7-ELEVEN and FamilyMart: store codes are REAL ones from the store lists supplied by the client
--    (taiwan_711_all.xlsx / familymart_all.xlsx, 120 of each embedded below);
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
    -- short English first names, letters only (the 7-ELEVEN import rejects digits and long names)
    v_names     TEXT[] := ARRAY['Anna','Lisa','Maya','Rina','Dewi','Sari','Mia','Nina','Tina','Lina',
                                'Ayu','Ika','Eka','Fitri','Yuni','Wati','Siti','Rani','Putri','Nisa',
                                'Amy','Emma','Olivia','Sophia','Grace','Chloe','Ella','Ruby','Zoe','Lucy'];
    v_stores_711 TEXT[] := ARRAY[
        '196408|鄉親寮',
        '901776|東東',
        '276513|鑫華新',
        '111212|軍福',
        '267966|松昌',
        '277147|長億',
        '909149|萬文',
        '264853|甲旺',
        '890704|立新',
        '258272|永丰富',
        '969026|東英',
        '282884|頂尖',
        '944245|潭寶',
        '158288|吉龍',
        '193982|逢星',
        '275417|華美',
        '294049|豐科',
        '282611|龍新',
        '250083|榮鑽',
        '886059|東崙',
        '257888|中正許昌',
        '215253|鑫吉',
        '961000|惠安',
        '255022|西湖',
        '228776|陽明',
        '170864|鵬馳',
        '195900|珍饌',
        '992945|社中',
        '171063|和金',
        '274159|科技站',
        '190123|世新大',
        '193236|京寶',
        '990352|松禾',
        '996372|鑫武昌',
        '846659|仁德',
        '276018|海安',
        '264060|松美',
        '780827|和順',
        '967086|二鎮',
        '243177|蓁蓁',
        '854557|一心',
        '151494|臻品',
        '286004|文炳',
        '970358|麻學',
        '892962|都蘭',
        '238441|嘉西',
        '268914|7B',
        '121253|世川',
        '269478|海大勇泉',
        '288734|碇遠',
        '154987|新復興',
        '231222|蘇濱',
        '194295|華敬',
        '972697|五房',
        '260552|上亨',
        '276155|光政',
        '913274|彰醫',
        '262879|順風',
        '195874|管興',
        '971155|鹿正',
        '164696|興光',
        '274115|六張街',
        '166441|板勝',
        '263779|圓德',
        '233594|欣順',
        '195645|城庚',
        '155566|新順安',
        '273673|新宜',
        '231381|華城',
        '282976|興洲',
        '207919|吉翠',
        '273776|府中',
        '162162|忠柯',
        '199072|龍興',
        '239765|永利',
        '234667|汐水',
        '286185|明貴',
        '293323|新滬站',
        '240455|長洲',
        '263171|歌園',
        '130833|泰一',
        '275509|公學',
        '276111|香圃',
        '110699|耕新',
        '200125|義山',
        '284237|加勝',
        '141453|聖央',
        '251813|莊壢',
        '281456|柏德',
        '253392|八福',
        '254258|江海',
        '158543|寶麗',
        '137661|新屋山',
        '212335|京采',
        '264392|復麗',
        '131076|新梅',
        '181141|桃捷',
        '952327|蘆航',
        '285838|曜駿',
        '257833|喜福',
        '113506|揚光',
        '234070|豐學',
        '274414|蓮昌',
        '166315|科七',
        '259024|聯大二坪',
        '278221|慶丞',
        '189226|朝天宮',
        '922027|春流',
        '872522|興平',
        '263654|方城市',
        '276720|京吉',
        '273466|亞新灣',
        '286510|大民',
        '278380|新成功',
        '902333|雲崗',
        '239101|園東',
        '275222|樂民',
        '980702|月光山',
        '200527|合行',
        '243731|風勝'];
    v_stores_fm TEXT[] := ARRAY[
        '022018|全家南投中寮店',
        '019269|全家埔里埔基店',
        '024068|全家草屯富功店',
        '017686|全家台中遠大店',
        '018026|全家台中松茂店',
        '024481|全家台中新興安店',
        '024173|全家台中國圖館店',
        '021669|全家台中五權西店',
        '018991|全家大甲鐵山店',
        '021350|全家大里金大發店',
        '016428|全家太平廣三店',
        '025567|全家太平育賢店',
        '024923|全家台中金站店',
        '024793|全家沙鹿森美店',
        '022806|全家潭子聚興店',
        '019995|全家台中金可店',
        '019369|全家台中新福瑞店',
        '024161|全家台中金航發店',
        '024031|全家豐原育仁店',
        '023217|全家龍井龍勝店',
        '021268|全家中山捷運站店',
        '024488|全家合江店',
        '017358|全家福昌店',
        '024037|全家台鐵西店',
        '020809|全家松仁店',
        '015432|全家湖山店',
        '024503|全家湖安店',
        '022256|全家華儷店',
        '023390|全家工業二店',
        '023710|全家德忠店',
        '023111|全家寧夏店',
        '021555|全家義和店',
        '024769|全家和鑫店',
        '019449|全家興園店',
        '016542|全家松民店',
        '025230|全家冠德店',
        '022621|全家新廣州店',
        '017567|全家仁德鼎安店',
        '024980|全家台南誌港店',
        '021404|全家台南大安店',
        '018630|全家官田新田店',
        '024180|全家新營南新店',
        '025309|全家歸仁媽廟店',
        '025944|全家永康福樂店',
        '022151|全家台東中興店',
        '024646|全家嘉義文青店',
        '020860|全家大林慈院店',
        '025723|全家中正大學店',
        '023753|全家基隆富港店',
        '025037|全家基隆新樂群店',
        '021643|全家壯圍濱海店',
        '017630|全家羅東北城店',
        '016277|全家屏東廣興店',
        '017842|全家新埤屏鵝店',
        '017955|全家里港豪吉店',
        '016997|全家員林新員農店',
        '017443|全家彰化彰興店',
        '022733|全家溪湖再發店',
        '019107|全家鹿港大有店',
        '016177|全家三重福運店',
        '022975|全家三重新運店',
        '025889|全家三重永安店',
        '020948|全家中和華福店',
        '023992|全家中和勝平店',
        '020456|全家八里船頭店',
        '022176|全家土城永豐店',
        '018336|全家新店復興店',
        '023778|全家新店新安店',
        '025961|全家新店忠誠店',
        '021405|全家新莊金豐店',
        '024328|全家新莊中榮店',
        '017478|全家板橋大雅店',
        '021553|全家板橋莒光店',
        '023335|全家板橋金園店',
        '025332|全家板橋四維店',
        '024756|全家林口新都店',
        '023929|全家樹林新全球店',
        '021502|全家永和環河店',
        '021210|全家汐止興莊店',
        '026003|全家汐止日月光店',
        '020604|全家淡水江南店',
        '025181|全家淡水河岸店',
        '017425|全家蘆洲花園店',
        '018537|全家貢寮澳底一店',
        '023339|全家新竹富美店',
        '020706|全家新竹金肥店',
        '025091|全家新竹新莊店',
        '018668|全家新豐大興店',
        '025275|全家湖口達仁店',
        '022515|全家竹北嘉興店',
        '025573|全家竹東新市店',
        '021068|全家中壢三和店',
        '023900|全家中壢環福店',
        '018423|全家八德瑞德店',
        '022549|全家大園大工店',
        '022070|全家平鎮壢新店',
        '020786|全家桃園永順店',
        '023928|全家桃園文昌店',
        '019228|全家楊梅北都店',
        '021526|全家蘆竹南興店',
        '022074|全家龍潭兄弟店',
        '023081|全家龜山忠義店',
        '018275|全家澎湖鑫科店',
        '019917|全家新城望海店',
        '019907|全家三義金美店',
        '022107|全家竹南福大埔店',
        '024630|全家苗栗水源店',
        '025703|全家頭份尚順店',
        '017379|全家古坑永光店',
        '018068|全家東勢安康店',
        '019489|全家麥寮橋頭店',
        '024569|全家高雄九華店',
        '017001|全家高雄鄭和店',
        '024691|全家大發開封店',
        '024473|全家高雄康莊店',
        '024001|全家高雄富國店',
        '021990|全家梓官大舍東店',
        '025441|全家日月光三店',
        '021347|全家高雄真愛店',
        '016690|全家鳳山鳳埤店'];
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
    INSERT INTO customers (name, phone, address) VALUES ('Blake', '0912345678', '') RETURNING id INTO v_cust_bl;
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
        v_stores := CASE v_type WHEN 'cvs_711' THEN v_stores_711 WHEN 'cvs_familymart' THEN v_stores_fm END;

        FOR i IN 1..100 LOOP
            v_name := v_names[1 + (i % array_length(v_names, 1))];
            v_phone := '0900' || lpad((CASE v_type WHEN 'cvs_711' THEN 100000 WHEN 'cvs_familymart' THEN 200000 ELSE 300000 END + i)::text, 6, '0');
            v_code := ''; v_store := ''; v_addr := '';
            v_cust := NULL;

            IF v_type = 'courier' THEN
                v_addr := '台北市中山區測試路' || i || '號' || (i % 9 + 1) || '樓';
            ELSE
                v_code := split_part(v_stores[1 + (i % array_length(v_stores, 1))], '|', 1);
                v_store := split_part(v_stores[1 + (i % array_length(v_stores, 1))], '|', 2);
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
