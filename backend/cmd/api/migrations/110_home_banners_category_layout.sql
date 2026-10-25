-- =========================================================
-- Adjust #144 / #145 / #146: website homepage banners, featured categories and the category page layout.
--
--   home_banners             #144: the banners of the homepage carousel (image, optional link, order, on/off).
--                            Without any active banner the old fixed hero keeps showing.
--   category_layout_sections #146: sections of the category page, each with a template:
--                            large_left (one 2x2 card + four 1x1 cards), large_right (mirrored) or all_small.
--   category_layout_slots    which category sits in which slot (0 = the large card for the large templates;
--                            5 slots per section). A slot without a row is empty and is not shown on the website.
--   categories.cover_url     (087_storefront_v2.sql) is the card image of a category; it can now be uploaded
--                            and replaced from the admin.
--   #145 featured categories use home_modules.config {"limit": n, "category_ids": [..]} (no table needed).
-- =========================================================

CREATE TABLE home_banners (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    link_url TEXT NOT NULL DEFAULT '',
    alt VARCHAR(150) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_home_banners_order ON home_banners(sort_order, id);

CREATE TABLE category_layout_sections (
    id SERIAL PRIMARY KEY,
    template VARCHAR(12) NOT NULL CHECK (template IN ('large_left', 'large_right', 'all_small')),
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE category_layout_slots (
    section_id INT NOT NULL REFERENCES category_layout_sections(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 4),
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (section_id, slot)
);

-- admin tab for the category layout page (same access as the Home Modules tab at first)
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'website_categories', access_level FROM role_tab_access WHERE tab_key = 'website_home'
ON CONFLICT (role_name, tab_key) DO NOTHING;
