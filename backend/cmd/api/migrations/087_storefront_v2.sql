-- Storefront v2 (ralulu design rebuild): everything the new customer website reads that the admin
-- did not have yet. All additive - nothing existing is changed or dropped.

-- ---- categories: tree + cover + slug (Category page groups children under a parent) ----
ALTER TABLE categories ADD COLUMN parent_id INT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN slug VARCHAR(120);
ALTER TABLE categories ADD COLUMN cover_url TEXT;
ALTER TABLE categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN show_on_home BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_categories_slug ON categories(slug) WHERE slug IS NOT NULL;

-- ---- products: live code (#A12 said by the host), try-on video ----
ALTER TABLE products ADD COLUMN live_code VARCHAR(20);
ALTER TABLE products ADD COLUMN video_url TEXT;
ALTER TABLE products ADD COLUMN video_poster_url TEXT;
ALTER TABLE products ADD COLUMN complete_the_look INT[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_products_live_code ON products(upper(live_code)) WHERE live_code IS NOT NULL;

-- ---- hosts: public profile ----
ALTER TABLE hosts ADD COLUMN slug VARCHAR(80);
ALTER TABLE hosts ADD COLUMN alias TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE hosts ADD COLUMN avatar_url TEXT;
ALTER TABLE hosts ADD COLUMN cover_url TEXT;
ALTER TABLE hosts ADD COLUMN bio TEXT;
ALTER TABLE hosts ADD COLUMN height_cm INT;
ALTER TABLE hosts ADD COLUMN weight_kg INT;
ALTER TABLE hosts ADD COLUMN usual_size VARCHAR(40);
ALTER TABLE hosts ADD COLUMN style_note VARCHAR(120);
ALTER TABLE hosts ADD COLUMN favorites VARCHAR(160);
ALTER TABLE hosts ADD COLUMN tiktok_url TEXT;
ALTER TABLE hosts ADD COLUMN live_url TEXT;
ALTER TABLE hosts ADD COLUMN live_url_expires_at TIMESTAMPTZ;
ALTER TABLE hosts ADD COLUMN live_status VARCHAR(12) NOT NULL DEFAULT 'offline' CHECK (live_status IN ('live', 'scheduled', 'offline'));
ALTER TABLE hosts ADD COLUMN live_title VARCHAR(160);
ALTER TABLE hosts ADD COLUMN next_live_at TIMESTAMPTZ;
ALTER TABLE hosts ADD COLUMN next_live_title VARCHAR(160);
ALTER TABLE hosts ADD COLUMN viewer_count INT;
ALTER TABLE hosts ADD COLUMN display_order INT NOT NULL DEFAULT 0;
ALTER TABLE hosts ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hosts ADD COLUMN seo_title VARCHAR(120);
ALTER TABLE hosts ADD COLUMN seo_description VARCHAR(300);
ALTER TABLE hosts ADD COLUMN blocks JSONB NOT NULL DEFAULT '{"intro":true,"live":true,"coupons":true,"outfits":true,"picks":true,"journal":true,"wardrobe":true}';
CREATE UNIQUE INDEX idx_hosts_slug ON hosts(lower(slug)) WHERE slug IS NOT NULL;

-- Products a host shows on the website. kind: showing = on screen right now, worn = worn before,
-- pick = the host's recommendation. When a host has no manual rows the API falls back to products
-- sold through that host's LIVE sessions.
CREATE TABLE host_products (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'worn' CHECK (kind IN ('showing', 'worn', 'pick')),
    wear_size VARCHAR(20),
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (host_id, product_id, kind)
);
CREATE INDEX idx_host_products_product ON host_products(product_id);

CREATE TABLE host_outfits (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    tag VARCHAR(60),
    sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE host_outfit_items (
    outfit_id INT NOT NULL REFERENCES host_outfits(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (outfit_id, variant_id)
);

CREATE TABLE host_replays (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    url TEXT NOT NULL,
    duration_sec INT,
    aired_on DATE,
    sort_order INT NOT NULL DEFAULT 0
);

-- Coupons shown on a host's page (claimed by the live code the host says on air).
CREATE TABLE host_coupons (
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    promotion_id INT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    title VARCHAR(160),
    subtitle VARCHAR(200),
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (host_id, promotion_id)
);

-- ---- content CMS: style topics, articles, host journal ----
CREATE TABLE content_pages (
    id SERIAL PRIMARY KEY,
    type VARCHAR(12) NOT NULL CHECK (type IN ('topic', 'article', 'host_article')),
    slug VARCHAR(140) NOT NULL UNIQUE,
    title JSONB NOT NULL DEFAULT '{}',        -- {"id":"..","en":"..","zh":".."}
    summary JSONB NOT NULL DEFAULT '{}',
    body JSONB NOT NULL DEFAULT '{}',         -- per language: array of blocks {type,text|items|product_id}
    category_label JSONB NOT NULL DEFAULT '{}',
    cover_url TEXT,
    cover_alt JSONB NOT NULL DEFAULT '{}',
    author_host_id INT REFERENCES hosts(id) ON DELETE SET NULL,
    author_name VARCHAR(80),
    read_minutes INT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    seo_title JSONB NOT NULL DEFAULT '{}',
    seo_description JSONB NOT NULL DEFAULT '{}',
    canonical_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    is_indexed BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_pages_type ON content_pages(type, is_published, published_at DESC);
CREATE TABLE content_page_products (
    page_id INT NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (page_id, product_id)
);
CREATE TABLE content_page_categories (
    page_id INT NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, category_id)
);
CREATE TABLE content_page_hosts (
    page_id INT NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, host_id)
);

-- ---- home modules (order / on-off / titles; disabled ones are never sent to the website) ----
CREATE TABLE home_modules (
    key VARCHAR(30) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    position INT NOT NULL DEFAULT 0,
    title JSONB NOT NULL DEFAULT '{}',
    subtitle JSONB NOT NULL DEFAULT '{}',
    config JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO home_modules (key, enabled, position, title, subtitle, config) VALUES
 ('live',         true, 1, '{"id":"Area Live","en":"Live now","zh":"直播區"}', '{"id":"Semua live ›","en":"All live ›","zh":"全部直播 ›"}', '{}'),
 ('categories',   true, 2, '{"id":"Kategori pilihan","en":"Featured categories","zh":"精選分類"}', '{"id":"Lihat semua ›","en":"See all ›","zh":"查看全部 ›"}', '{"limit":6}'),
 ('best_sellers', true, 3, '{"id":"Produk terlaris","en":"Best sellers","zh":"熱賣商品"}', '{"id":"Lihat semua ›","en":"See all ›","zh":"查看全部 ›"}', '{"limit":10,"days":7}'),
 ('new_in',       true, 4, '{"id":"Baru minggu ini","en":"New this week","zh":"本週新品"}', '{"id":"Lihat semua ›","en":"See all ›","zh":"查看全部 ›"}', '{"limit":8,"days":7}'),
 ('hosts',        true, 5, '{"id":"Host populer","en":"Popular hosts","zh":"人氣主播"}', '{"id":"Semua host ›","en":"All hosts ›","zh":"全部主播 ›"}', '{"limit":8}'),
 ('topics',       true, 6, '{"id":"Topik gaya","en":"Style topics","zh":"穿搭專題"}', '{"id":"Semua topik ›","en":"All topics ›","zh":"全部專題 ›"}', '{"limit":5}');

-- ---- customer-facing requests ----
CREATE TABLE restock_requests (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id) ON DELETE CASCADE,
    contact VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at TIMESTAMPTZ
);
CREATE TABLE web_return_requests (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'return' CHECK (kind IN ('return', 'exchange')),
    reason VARCHAR(30) NOT NULL,
    note TEXT,
    item_ids INT[] NOT NULL DEFAULT '{}',
    photos TEXT[] NOT NULL DEFAULT '{}',
    return_method VARCHAR(20),
    refund_method VARCHAR(20),
    status VARCHAR(12) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'done', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- orders: where the order came from + whether the pickup store was verified ----
ALTER TABLE orders ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'self_checkout', 'cs_assisted'));
ALTER TABLE orders ADD COLUMN pickup_store_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN recipient_email VARCHAR(150);
UPDATE orders SET source = 'self_checkout' WHERE order_no LIKE 'WEB-%';

-- ---- theme system (Theme_Spec) ----
CREATE TABLE theme_versions (
    id SERIAL PRIMARY KEY,
    status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    preset_key VARCHAR(30),
    name VARCHAR(80) NOT NULL,
    tokens JSONB NOT NULL,
    mode VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (mode IN ('light', 'soft')),
    validation JSONB NOT NULL DEFAULT '{}',
    based_on INT REFERENCES theme_versions(id),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_theme_one_published ON theme_versions((true)) WHERE status = 'published';
CREATE UNIQUE INDEX idx_theme_one_draft ON theme_versions((true)) WHERE status = 'draft';
CREATE TABLE theme_publish_log (
    id SERIAL PRIMARY KEY,
    version_id INT REFERENCES theme_versions(id),
    action VARCHAR(20) NOT NULL,
    ok BOOLEAN NOT NULL DEFAULT true,
    message TEXT,
    by_user INT REFERENCES users(id),
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE theme_preview_links (
    token VARCHAR(40) PRIMARY KEY,
    tokens JSONB NOT NULL,
    mode VARCHAR(10) NOT NULL DEFAULT 'light',
    expires_at TIMESTAMPTZ NOT NULL
);
INSERT INTO theme_versions (status, preset_key, name, tokens, mode, validation, published_at) VALUES (
    'published', 'peach', 'Peach + Putih',
    '{"primary":"#FF8C69","onPrimary":"#2B2B2E","primaryHover":"#F7795A","primaryStrong":"#B8432D","primarySoft":"#FFEDE6","secondary":"#FFC9B8","bg":"#FFFFFF","bgSoft":"#F7F7F8","surface":"#FFFFFF","text":"#2B2B2E","text2":"#5F6168","text3":"#6B6E76","disabled":"#9AA0A6","border":"#ECEDEF","borderStrong":"#8C9098","success":"#2E7D52","warning":"#9A5B00","error":"#C62828","info":"#2F6FA3","live":"#D32F2F"}',
    'light', '{"passed":true,"issues":[]}', now());

-- ---- store settings defaults (WhatsApp hand-off number is editable in Ralulu Hub > Store Profile) ----
INSERT INTO store_settings (key, value) VALUES
 ('whatsapp_number', '6282220056883'),
 ('cs_hours', '10:00-22:00'),
 ('cs_hours_note', ''),
 ('social_youtube', ''), ('social_instagram', ''), ('social_facebook', ''), ('social_tiktok', ''),
 ('free_shipping_active', 'true'), ('free_shipping_start', ''), ('free_shipping_end', '')
ON CONFLICT (key) DO NOTHING;

-- ---- tab permissions for the new admin screens (same access as the Store Profile tab at first) ----
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, k, access_level FROM role_tab_access, (VALUES ('website_home'), ('website_hosts'), ('website_content'), ('theme')) AS t(k)
WHERE tab_key = 'store_profile'
ON CONFLICT (role_name, tab_key) DO NOTHING;
