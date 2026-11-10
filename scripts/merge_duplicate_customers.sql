-- One-time cleanup: customers saved twice (same name + same phone digits, e.g. Siti 0910418652 as ids 916 and 1816)
-- are merged into the oldest record. Their orders, notes, labels, promotion redemptions and member / user links
-- move to it; blanks (email, address) are filled from the duplicates; the duplicate rows are then deleted.
-- Names differing in anything but case / spacing stay separate (e.g. family members sharing a phone).
--
-- Run it as a DRY RUN first (it ends with ROLLBACK and prints what it would do):
--   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" -v ON_ERROR_STOP=1 < scripts/merge_duplicate_customers.sql
-- When the numbers look right, run it for real (change the last line to COMMIT, or pass -v commit=1):
--   ... psql ... -v ON_ERROR_STOP=1 -v commit=1 < scripts/merge_duplicate_customers.sql
-- Take a backup first (pg_dump) - deleting customer rows cannot be undone.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE dup_map ON COMMIT DROP AS
SELECT c.id AS dup_id, k.keep_id
FROM customers c
JOIN (
    SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS nkey,
           regexp_replace(COALESCE(phone,''), '\D', '', 'g') AS pkey,
           min(id) AS keep_id
    FROM customers
    WHERE regexp_replace(COALESCE(phone,''), '\D', '', 'g') <> ''
    GROUP BY 1, 2 HAVING count(*) > 1
) k ON k.nkey = lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g'))
   AND k.pkey = regexp_replace(COALESCE(c.phone,''), '\D', '', 'g')
WHERE c.id <> k.keep_id;

\echo === duplicates to merge (dup_id -> keep_id) ===
SELECT m.dup_id, m.keep_id, c.name, c.phone,
       (SELECT count(*) FROM orders o WHERE o.customer_id = m.dup_id) AS orders_moved
FROM dup_map m JOIN customers c ON c.id = m.dup_id ORDER BY m.keep_id, m.dup_id;

-- blanks on the kept record are filled from a duplicate
UPDATE customers k SET
    email   = COALESCE(NULLIF(k.email,''),   (SELECT NULLIF(d.email,'')   FROM customers d JOIN dup_map m ON m.dup_id = d.id WHERE m.keep_id = k.id AND NULLIF(d.email,'')   IS NOT NULL ORDER BY d.id DESC LIMIT 1)),
    address = COALESCE(NULLIF(k.address,''), (SELECT NULLIF(d.address,'') FROM customers d JOIN dup_map m ON m.dup_id = d.id WHERE m.keep_id = k.id AND NULLIF(d.address,'') IS NOT NULL ORDER BY d.id DESC LIMIT 1))
WHERE k.id IN (SELECT keep_id FROM dup_map);

UPDATE orders                SET customer_id = m.keep_id FROM dup_map m WHERE customer_id = m.dup_id;
UPDATE users                 SET customer_id = m.keep_id FROM dup_map m WHERE customer_id = m.dup_id;
UPDATE promotion_redemptions SET customer_id = m.keep_id FROM dup_map m WHERE customer_id = m.dup_id;
UPDATE members               SET customer_id = m.keep_id FROM dup_map m WHERE customer_id = m.dup_id;
UPDATE customer_notes        SET customer_id = m.keep_id FROM dup_map m WHERE customer_id = m.dup_id;
INSERT INTO customer_labels (customer_id, label, created_at)
    SELECT m.keep_id, l.label, l.created_at FROM customer_labels l JOIN dup_map m ON m.dup_id = l.customer_id
    ON CONFLICT DO NOTHING;
DELETE FROM customer_labels WHERE customer_id IN (SELECT dup_id FROM dup_map);

DELETE FROM customers WHERE id IN (SELECT dup_id FROM dup_map);

\echo === customers left per name + phone (must all be 1) ===
SELECT count(*) AS still_duplicated FROM (
    SELECT 1 FROM customers WHERE regexp_replace(COALESCE(phone,''), '\D', '', 'g') <> ''
    GROUP BY lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), regexp_replace(COALESCE(phone,''), '\D', '', 'g') HAVING count(*) > 1
) x;

\if :{?commit}
COMMIT;
\echo COMMITTED
\else
ROLLBACK;
\echo DRY RUN - rolled back. Re-run with -v commit=1 to apply.
\endif
