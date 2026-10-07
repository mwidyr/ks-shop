-- Manually maintained per-language product names (replaces the idea of an auto-translation
-- service). products.name stays the canonical Chinese name (used as-is for Purchase Requisition
-- copy / PO export and as the fallback); products.names holds optional overrides keyed by
-- language code, e.g. {"id": "Bra Renda", "vi": "..."}. Languages are a master list so new ones
-- (Vietnamese, Filipino, ...) can be added from Settings without any schema change.

CREATE TABLE languages (
    code VARCHAR(10) PRIMARY KEY,
    label VARCHAR(60) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO languages (code, label, sort_order) VALUES
    ('zh', '中文 (Chinese)', 0),
    ('id', 'Bahasa Indonesia', 1),
    ('en', 'English', 2);

ALTER TABLE products ADD COLUMN names JSONB NOT NULL DEFAULT '{}';
-- All name VALUES (not the JSON keys, which would false-match searches like "id") joined by a
-- space, maintained by the app on create/update; searched with ILIKE alongside name and sku.
ALTER TABLE products ADD COLUMN names_search TEXT NOT NULL DEFAULT '';
