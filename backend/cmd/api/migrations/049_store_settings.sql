-- Small key/value settings table for shop-facing branding, starting with the shop name shown
-- on the login page and sidebar (previously a hardcoded translation string) - same key/value
-- shape as app_settings (017_app_settings.sql), just TEXT-valued since app_settings.value is
-- NUMERIC only and wrong for a name.
CREATE TABLE store_settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO store_settings (key, value) VALUES ('shop_name', 'Ohlala Shop');
