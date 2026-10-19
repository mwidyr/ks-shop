-- Style Content editor: rich introduction, separate draft of a published article, custom content types,
-- article templates. Idempotent.

-- The introduction: `summary` stays the PLAIN text (previews, meta description), intro_html is the formatted version.
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS intro_html JSONB NOT NULL DEFAULT '{}';

-- A published article keeps its live columns untouched while staff edit: autosave / Save Draft write the
-- whole form here, and Update copies it into the live columns.
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS draft JSONB;
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS draft_saved_at TIMESTAMPTZ;

-- Types are no longer a fixed list.
ALTER TABLE content_pages DROP CONSTRAINT IF EXISTS content_pages_type_check;
ALTER TABLE content_pages ALTER COLUMN type TYPE VARCHAR(40);

CREATE TABLE IF NOT EXISTS content_types (
    id         SERIAL PRIMARY KEY,
    slug       VARCHAR(40) NOT NULL UNIQUE,
    names      JSONB NOT NULL DEFAULT '{}',   -- {"id":"..","en":"..","zh":"..","vi":".."}
    is_system  BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO content_types (slug, names, is_system, sort_order) VALUES
    ('topic',        '{"id":"Topik","en":"Topic","zh":"主題","vi":"Chủ đề"}', true, 1),
    ('article',      '{"id":"Artikel","en":"Article","zh":"文章","vi":"Bài viết"}', true, 2),
    ('host_article', '{"id":"Jurnal host","en":"Host Journal","zh":"主播日誌","vi":"Nhật ký host"}', true, 3)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS content_templates (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    blocks     JSONB NOT NULL DEFAULT '[]',
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_pages_updated ON content_pages (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pages_lang_updated ON content_pages (lang, updated_at DESC);
