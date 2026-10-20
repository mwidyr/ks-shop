-- Dijalankan HANYA di database TESTING, sesudah data production disalin ke sana (scripts/staging_sync_from_prod.sh).
-- Ini BUKAN masking data pelanggan: hanya mematikan kanal keluar yang tersimpan di database, supaya server testing
-- tidak mengirim pesan ke grup Telegram / orang sungguhan.
--   - token bot Telegram (store_settings) dihapus
--   - chat id Telegram global (telegram_config) dan chat id tiap Location dikosongkan
-- (Email, WhatsApp, ECPay, OpenAI, dst diatur lewat .env - biarkan kosong di server testing.)
\set ON_ERROR_STOP on

WITH d AS (DELETE FROM store_settings WHERE key = 'telegram_bot_token' RETURNING 1)
SELECT 'telegram_bot_token dihapus' AS langkah, count(*) AS baris FROM d;

WITH u AS (
    UPDATE store_settings
       SET value = (value::jsonb || '{"global_chat_id": ""}'::jsonb)::text
     WHERE key = 'telegram_config' AND value ~ '^\s*\{'
    RETURNING 1)
SELECT 'telegram_config.global_chat_id dikosongkan' AS langkah, count(*) AS baris FROM u;

WITH u AS (UPDATE host_locations SET telegram_chat_id = NULL WHERE telegram_chat_id IS NOT NULL RETURNING 1)
SELECT 'host_locations.telegram_chat_id dikosongkan' AS langkah, count(*) AS baris FROM u;
