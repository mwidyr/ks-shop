-- =========================================================
-- Variant SKU restructure before go-live (3PL needs color + size in every SKU):
--   SKU = PRODUCT CODE - COLOR - SIZE, e.g. C002-黑-F, P026-白-M
-- The color is the full Chinese name from Color Master (colors.name_zh); a legacy color stored in
-- Indonesian (colors.name_id, e.g. "Hitam") is translated to it, anything outside the master is
-- kept as typed. Spaces are removed and the code/size are upper-cased. Variants whose SKU would
-- collide get a 1-digit suffix (-1, -2, ...) in id order. Every old SKU is kept in
-- variant_sku_history so old labels / 3PL files can still be looked up.
--   product_variants.sku_manual  a SKU typed by a super_user - never recomputed automatically.
-- See buildVariantSKU in products.go for the same rule on new / edited variants.
-- =========================================================

ALTER TABLE product_variants ADD COLUMN sku_manual BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE variant_sku_history (
    id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    old_sku VARCHAR(60) NOT NULL,
    new_sku VARCHAR(60) NOT NULL,
    reason VARCHAR(30) NOT NULL,          -- restructure | variant_edit | product_code_change | manual
    changed_by INT REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variant_sku_history_variant ON variant_sku_history(variant_id);
CREATE INDEX idx_variant_sku_history_old ON variant_sku_history(lower(old_sku));

CREATE TEMP TABLE sku_restructure ON COMMIT DROP AS
WITH base AS (
    SELECT pv.id, pv.sku AS old_sku,
           array_to_string(array_remove(ARRAY[
               NULLIF(upper(regexp_replace(p.sku, '\s', '', 'g')), ''),
               NULLIF(upper(regexp_replace(COALESCE(
                   (SELECT c.name_zh FROM colors c WHERE c.name_zh = btrim(pv.color) LIMIT 1),
                   (SELECT c.name_zh FROM colors c WHERE lower(c.name_id) = lower(btrim(pv.color)) ORDER BY c.id LIMIT 1),
                   pv.color, ''), '\s', '', 'g')), ''),
               NULLIF(upper(regexp_replace(COALESCE(pv.size, ''), '\s', '', 'g')), '')
           ], NULL), '-') AS base
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE p.sku IS NOT NULL AND btrim(p.sku) <> ''
)
SELECT id, old_sku,
       CASE WHEN rn = 1 THEN base ELSE base || '-' || (rn - 1) END AS new_sku
FROM (SELECT id, old_sku, base, row_number() OVER (PARTITION BY base ORDER BY id) AS rn FROM base) ranked;

INSERT INTO variant_sku_history (variant_id, old_sku, new_sku, reason)
SELECT id, old_sku, new_sku, 'restructure' FROM sku_restructure WHERE old_sku <> new_sku;

-- sku is UNIQUE: park every changing row on a placeholder first so a new SKU can take an old one.
UPDATE product_variants pv SET sku = '#tmp-' || pv.id
FROM sku_restructure s WHERE s.id = pv.id AND s.old_sku <> s.new_sku;
UPDATE product_variants pv SET sku = s.new_sku
FROM sku_restructure s WHERE s.id = pv.id AND s.old_sku <> s.new_sku;
