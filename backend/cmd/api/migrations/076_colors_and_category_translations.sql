-- Category & Color master data with Chinese/Indonesian translation (Adjust-sheet items
-- 063/064/066). Chinese (name_zh) stays the canonical value products.category and
-- product_variants.color are matched against, unchanged from today's free-text behavior;
-- name_id is a pure display-layer translation for the Indonesian-locale UI. Source: the
-- client-provided Master.xlsx dictionary (manually curated, no translation API involved).

ALTER TABLE categories ADD COLUMN name_zh VARCHAR(100);
ALTER TABLE categories ADD COLUMN name_id VARCHAR(100);

-- Backfill every pre-existing category (ad hoc free text, no governance until now) so nothing
-- is ever NULL - they keep displaying exactly as they do today until officially translated.
UPDATE categories SET name_zh = name, name_id = name WHERE name_zh IS NULL;

ALTER TABLE categories ALTER COLUMN name_zh SET NOT NULL;
ALTER TABLE categories ALTER COLUMN name_id SET NOT NULL;

-- Upsert the 8 official categories from Master.xlsx: update in place (preserving id and any
-- existing product linkage) if a category with that Chinese name already exists, else insert.
INSERT INTO categories (name, name_zh, name_id)
VALUES ('內衣', '內衣', 'Inner')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('上衣', '上衣', 'Atasan')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('下身', '下身', 'Bawahan')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('配件', '配件', 'Aksesoris')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('套裝', '套裝', 'Set')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('內褲', '內褲', 'CD')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('外套', '外套', 'Outer')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;
INSERT INTO categories (name, name_zh, name_id)
VALUES ('背心', '背心', 'Tanktop')
ON CONFLICT (name) DO UPDATE SET name_id = EXCLUDED.name_id;

-- New managed color master list - product_variants.color stays free text (same pattern as
-- categories), this table is the authoritative source for the Color Management UI and the
-- color picker added to Edit Product, plus the zh/id translation lookup used everywhere a
-- color name is displayed.
CREATE TABLE colors (
    id SERIAL PRIMARY KEY,
    name_zh VARCHAR(50) UNIQUE NOT NULL,
    name_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO colors (name_zh, name_id) VALUES
    ('黑', 'Hitam'),
    ('白', 'Putih'),
    ('粉', 'Pink'),
    ('紅', 'Merah'),
    ('藍', 'Biru'),
    ('灰', 'Abu'),
    ('深藍', 'Navy'),
    ('淺藍', 'Biru Muda'),
    ('杏', 'Krem'),
    ('咖', 'Coklat'),
    ('深灰', 'Abu Tua'),
    ('卡其', 'Khaki'),
    ('奶咖', 'Mocca'),
    ('綠', 'Hijau'),
    ('黃', 'Kuning'),
    ('膚', 'Nude'),
    ('紫', 'Ungu'),
    ('淺灰', 'Abu Muda'),
    ('米白', 'Broken White'),
    ('米', 'Krem'),
    ('水洗黑', 'Hitam Pekat'),
    ('燕麥', 'Krem Coklat Muda'),
    ('冷灰', 'Abu Kebiruan'),
    ('花灰', 'Abu Abu Polos'),
    ('奶黃', 'Kuning Butter'),
    ('霧藍', 'Biru Abu Abu'),
    ('灰藍', 'Biru Pastel Gelap'),
    ('香檳', 'Krem Keemasan'),
    ('深咖啡色', 'Coklat Tua'),
    ('奶奶灰', 'abu-abu susu'),
    ('寶藍', 'biru tua');

-- 'colors' tab access, mirroring how 036_role_tab_access.sql granted 'categories' to the
-- same roles - same audience manages both master-data lists.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'colors', access_level FROM role_tab_access WHERE tab_key = 'categories'
ON CONFLICT (role_name, tab_key) DO NOTHING;
