-- WEB ADJ 035: the announcement bar of the website homepage, managed on its own (not a home module, so the
-- Home Modules sorting does not move it). Each message has a text per language (id / en / zh; a missing
-- language falls back to the others) and the bar shows the active messages one after another in sort_order.
-- Additive: without a message the website keeps its old fixed info chips.
CREATE TABLE home_announcements (
    id SERIAL PRIMARY KEY,
    text_id VARCHAR(200) NOT NULL DEFAULT '',
    text_en VARCHAR(200) NOT NULL DEFAULT '',
    text_zh VARCHAR(200) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_home_announcements_order ON home_announcements(sort_order, id);
