-- =========================================================
-- Panel Siaran (Konsol Siaran) rebuild to match the reference: a
-- session now has a real draft/live/ended status and its own live
-- cart of products (each with a live-only price), independent of
-- host_id being set upfront.
-- =========================================================

ALTER TABLE live_sessions ALTER COLUMN host_id DROP NOT NULL;
ALTER TABLE live_sessions ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft';
-- draft, live, ended
ALTER TABLE live_sessions ADD COLUMN peak_viewers INT NOT NULL DEFAULT 0;
ALTER TABLE live_sessions ALTER COLUMN started_at DROP NOT NULL;
ALTER TABLE live_sessions ALTER COLUMN started_at DROP DEFAULT;

-- Existing rows (created under the old always-live-at-creation model) are already real
-- sessions that were "live" from creation - keep their history consistent.
UPDATE live_sessions SET status = CASE WHEN ended_at IS NOT NULL THEN 'ended' ELSE 'live' END;

CREATE TABLE live_session_products (
    id SERIAL PRIMARY KEY,
    live_session_id INT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    live_price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_session_products_session ON live_session_products(live_session_id);
