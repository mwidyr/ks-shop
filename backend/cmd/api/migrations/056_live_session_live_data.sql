-- =========================================================
-- Item #007 prerequisite: LIVE Data capture on live_sessions.
--
-- None of this existed before - the only prior field, peak_viewers, was
-- always 0 (no real source). These 10 columns match the KPI glossary in
-- the Performance Dashboard / Host Performance Analytics / Heatmap specs
-- exactly (Views, UV, Active, AWT, PCU, ACU, Follows, Chats, Shares,
-- Likes), entered manually by staff after a session ends (confirmed: no
-- TikTok/Shopee Live API integration exists to pull this automatically).
--
-- live_data_recorded_at is the "valid LIVE Session" flag every dashboard
-- spec depends on: a session only counts once this is set, distinguishing
-- "ended with no data entered yet" from "finalized with real numbers" (0
-- views entered on purpose looks different from never having been filled
-- in at all).
-- =========================================================

ALTER TABLE live_sessions ADD COLUMN views INT;
ALTER TABLE live_sessions ADD COLUMN uv INT;
ALTER TABLE live_sessions ADD COLUMN active_viewers INT;
ALTER TABLE live_sessions ADD COLUMN awt_seconds INT;
ALTER TABLE live_sessions ADD COLUMN pcu INT;
ALTER TABLE live_sessions ADD COLUMN acu NUMERIC(10,2);
ALTER TABLE live_sessions ADD COLUMN follows INT;
ALTER TABLE live_sessions ADD COLUMN chats INT;
ALTER TABLE live_sessions ADD COLUMN shares INT;
ALTER TABLE live_sessions ADD COLUMN likes INT;
ALTER TABLE live_sessions ADD COLUMN live_data_recorded_at TIMESTAMPTZ;
