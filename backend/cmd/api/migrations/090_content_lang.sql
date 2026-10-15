-- One language per article: staff from different countries write their own articles (not
-- translations of each other), the website filters by language and serves /{lang}/style/{slug}.
-- title / summary / body / ... stay JSONB maps; only the key of the article's own language is used.
ALTER TABLE content_pages
    ADD COLUMN lang VARCHAR(5) NOT NULL DEFAULT 'id' CHECK (lang IN ('id', 'en', 'zh', 'vi'));

-- Existing articles: the first language (id, en, zh) that has a body, else the first with a title.
UPDATE content_pages SET lang = CASE
    WHEN jsonb_array_length(COALESCE(body->'id', '[]'::jsonb)) > 0 THEN 'id'
    WHEN jsonb_array_length(COALESCE(body->'en', '[]'::jsonb)) > 0 THEN 'en'
    WHEN jsonb_array_length(COALESCE(body->'zh', '[]'::jsonb)) > 0 THEN 'zh'
    WHEN COALESCE(title->>'id', '') <> '' THEN 'id'
    WHEN COALESCE(title->>'en', '') <> '' THEN 'en'
    WHEN COALESCE(title->>'zh', '') <> '' THEN 'zh'
    ELSE 'id' END;

CREATE INDEX idx_content_pages_lang ON content_pages(lang, type, is_published, published_at DESC);
