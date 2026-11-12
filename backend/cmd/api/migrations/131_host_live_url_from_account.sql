-- LIVE links now follow the TikTok account assigned in CEK VIEWS Settings (https://www.tiktok.com/@<username>/live);
-- this aligns the links that already exist. Hosts without an assigned account keep their link.
UPDATE hosts h SET live_url = 'https://www.tiktok.com/@' || ltrim(ta.tiktok_id, '@') || '/live', live_url_expires_at = NULL
FROM cek_views_assignments ca JOIN tiktok_accounts ta ON ta.id = ca.tiktok_account_id
WHERE ca.host_id = h.id AND btrim(ta.tiktok_id) <> '';
