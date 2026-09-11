-- =========================================================
-- live_sessions never had a created_at column (024 only added
-- started_at, which is now nullable since a draft session may not
-- have started yet). Add it, backfilling old rows from started_at
-- since every pre-rebuild session was live from creation.
-- =========================================================

ALTER TABLE live_sessions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE live_sessions SET created_at = started_at WHERE started_at IS NOT NULL;
