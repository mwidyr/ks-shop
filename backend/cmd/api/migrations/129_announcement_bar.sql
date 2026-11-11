-- Homepage announcement bar, typewriter version (Ralulu Marquee Spec v4). One editable draft row plus an
-- append-only history of published versions (the latest 'published' row is live; a rollback marks it
-- 'rolled_back' so the previous one is live again). Every publish / rollback is logged with the editor.
-- Additive: the old home_announcements table is kept untouched; its active messages seed the first published version.
CREATE TABLE announcement_bar_versions (
    id SERIAL PRIMARY KEY,
    status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'published', 'rolled_back')),
    config JSONB NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
CREATE INDEX idx_announcement_bar_versions_status ON announcement_bar_versions(status, id DESC);

CREATE TABLE announcement_bar_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(16) NOT NULL,
    editor_id INT REFERENCES users(id) ON DELETE SET NULL,
    editor_name VARCHAR(120) NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    version_id INT REFERENCES announcement_bar_versions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO announcement_bar_versions (status, config, published_at)
SELECT 'published',
       jsonb_build_object(
         'enabled', true, 'preset', 'typewriter',
         'timing', jsonb_build_object('typeMs', 90, 'holdMs', 2400, 'eraseMs', 45, 'pauseMs', 400),
         'style', jsonb_build_object('background', '#A0344F', 'text', '#FFF5F7', 'accent', '#F9C9D5',
                                     'showPrompt', true, 'fontSize', 16, 'radius', 10),
         'messages', (SELECT jsonb_agg(jsonb_build_object(
                'id', 'm' || t.n, 'emoji', '',
                'text', jsonb_build_object('id', t.text_id, 'en', t.text_en, 'zh', t.text_zh),
                'url', '', 'enabled', true, 'from', NULL, 'until', NULL) ORDER BY t.n)
              FROM (SELECT row_number() OVER (ORDER BY sort_order, id) AS n, text_id, text_en, text_zh
                    FROM home_announcements WHERE is_active ORDER BY sort_order, id LIMIT 6) t)),
       now()
WHERE EXISTS (SELECT 1 FROM home_announcements WHERE is_active);
