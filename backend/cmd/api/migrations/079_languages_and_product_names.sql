-- Manually maintained per-language product names (replaces the idea of an auto-translation
-- service). products.name is the canonical, required name and is in Indonesian (also the
-- fallback everywhere); products.names holds OPTIONAL per-language names keyed by language code,
-- e.g. {"zh": "...", "en": "...", "vi": "..."}. Chinese is just another optional language, except
-- that Purchase Requisition copy / PO export always prefer it (falling back to name). Languages
-- are a master list so new ones (Vietnamese, Filipino, ...) can be added from Settings without
-- any schema change.

CREATE TABLE languages (
    code VARCHAR(10) PRIMARY KEY,
    label VARCHAR(60) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO languages (code, label, sort_order) VALUES
    ('id', 'Bahasa Indonesia', 0),
    ('zh', '中文 (Chinese)', 1),
    ('en', 'English', 2);

ALTER TABLE products ADD COLUMN names JSONB NOT NULL DEFAULT '{}';
-- All name VALUES (not the JSON keys, which would false-match searches like "id") joined by a
-- space, maintained by the app on create/update; searched with ILIKE alongside name and sku.
ALTER TABLE products ADD COLUMN names_search TEXT NOT NULL DEFAULT '';

-- Existing products were entered with the Chinese name in products.name. Keep that text as the
-- Chinese name (so Purchase Requisition copy is unchanged) - but only where it actually contains
-- Chinese characters; Latin/Indonesian legacy names stay solely in products.name.
UPDATE products SET names = jsonb_build_object('zh', name), names_search = name
WHERE name ~ '[\u4e00-\u9fff]';
