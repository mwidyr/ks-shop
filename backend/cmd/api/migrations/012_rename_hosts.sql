-- =========================================================
-- Hosts should be named after the person running the live
-- session, not the platform they stream on (that's already
-- tracked separately in the platform column).
-- =========================================================

UPDATE hosts SET name = 'Reni' WHERE name = 'Live TikTok A';
UPDATE hosts SET name = 'Tasya' WHERE name = 'Live TikTok B';
UPDATE hosts SET name = 'Nabila' WHERE name = 'Shopee Live';
UPDATE hosts SET name = 'Gofar' WHERE name = 'Instagram Live';

INSERT INTO hosts (name, platform)
SELECT 'Budi', 'TikTok'
WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE name = 'Budi');
