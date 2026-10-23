-- =========================================================
-- Color Master gets an English name (client file "Master (1).xlsx": CN / INDO / ENG) and variant
-- SKUs use it for the color part instead of the Chinese name from 106_variant_sku_restructure.sql:
--   SKU = PRODUCT CODE - ENGLISH COLOR - SIZE, e.g. C002-BLACK-F, P026-LIGHTBLUE-M
-- (upper-cased, spaces removed, same as the code and size). A variant color is matched against the
-- Chinese, Indonesian or English master name; outside the master the stored text is kept. name_zh
-- stays the canonical value product_variants.color is stored as - only the SKU changes here.
-- Every automatic (non-manual) SKU is recomputed; collisions get -1, -2, ... in id order and every
-- old SKU goes to variant_sku_history. Same rule as buildVariantSKU / resolveSKUColor (products.go).
-- =========================================================

ALTER TABLE colors ADD COLUMN name_en VARCHAR(50);

INSERT INTO colors (name_zh, name_id, name_en) VALUES
    ('黑', 'Hitam', 'Black'),
    ('白', 'Putih', 'White'),
    ('粉', 'Pink', 'Pink'),
    ('紅', 'Merah', 'Red'),
    ('藍', 'Biru', 'Blue'),
    ('灰', 'Abu', 'Gray'),
    ('深藍', 'Navy', 'Navy'),
    ('淺藍', 'Biru Muda', 'Light Blue'),
    ('杏', 'Krem', 'Beige'),
    ('咖', 'Coklat', 'Brown'),
    ('深灰', 'Abu Tua', 'Dark Gray'),
    ('卡其', 'Khaki', 'Khaki'),
    ('奶咖', 'Mocca', 'Mocha'),
    ('綠', 'Hijau', 'Green'),
    ('黃', 'Kuning', 'Yellow'),
    ('膚', 'Nude', 'Nude'),
    ('紫', 'Ungu', 'Purple'),
    ('淺灰', 'Abu Muda', 'Light Gray'),
    ('米白', 'Broken White', 'Off White'),
    ('米', 'Krem', 'Cream'),
    ('水洗黑', 'Hitam Pekat', 'Washed Black'),
    ('燕麥', 'Krem Coklat Muda', 'Oatmeal'),
    ('冷灰', 'Abu Kebiruan', 'Cool Gray'),
    ('花灰', 'Abu Abu Polos', 'Heather Gray'),
    ('奶黃', 'Kuning Butter', 'Butter Yellow'),
    ('霧藍', 'Biru Abu Abu', 'Dusty Blue'),
    ('灰藍', 'Biru Pastel Gelap', 'Gray Blue'),
    ('香檳', 'Krem Keemasan', 'Champagne'),
    ('深咖啡色', 'Coklat Tua', 'Dark Brown'),
    ('奶奶灰', 'abu-abu susu', 'Milky Gray'),
    ('寶藍', 'biru tua', 'Royal Blue')
ON CONFLICT (name_zh) DO UPDATE SET name_id = EXCLUDED.name_id, name_en = EXCLUDED.name_en;

CREATE TEMP TABLE sku_english ON COMMIT DROP AS
WITH base AS (
    SELECT pv.id, pv.sku AS old_sku,
           array_to_string(array_remove(ARRAY[
               NULLIF(upper(regexp_replace(p.sku, '\s', '', 'g')), ''),
               NULLIF(upper(regexp_replace(COALESCE(
                   (SELECT NULLIF(c.name_en, '') FROM colors c WHERE c.name_zh = btrim(pv.color) LIMIT 1),
                   (SELECT NULLIF(c.name_en, '') FROM colors c
                    WHERE lower(c.name_id) = lower(btrim(pv.color)) OR lower(c.name_en) = lower(btrim(pv.color))
                    ORDER BY c.id LIMIT 1),
                   pv.color, ''), '\s', '', 'g')), ''),
               NULLIF(upper(regexp_replace(COALESCE(pv.size, ''), '\s', '', 'g')), '')
           ], NULL), '-') AS base
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE p.sku IS NOT NULL AND btrim(p.sku) <> '' AND NOT pv.sku_manual
)
SELECT id, old_sku,
       CASE WHEN rn = 1 THEN base ELSE base || '-' || (rn - 1) END AS new_sku
FROM (SELECT id, old_sku, base, row_number() OVER (PARTITION BY base ORDER BY id) AS rn FROM base) ranked;

INSERT INTO variant_sku_history (variant_id, old_sku, new_sku, reason)
SELECT id, old_sku, new_sku, 'color_english' FROM sku_english WHERE old_sku <> new_sku;

-- sku is UNIQUE: park every changing row on a placeholder first so a new SKU can take an old one.
UPDATE product_variants pv SET sku = '#tmp-' || pv.id
FROM sku_english s WHERE s.id = pv.id AND s.old_sku <> s.new_sku;
UPDATE product_variants pv SET sku = s.new_sku
FROM sku_english s WHERE s.id = pv.id AND s.old_sku <> s.new_sku;
