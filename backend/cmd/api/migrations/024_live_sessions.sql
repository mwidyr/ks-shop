-- =========================================================
-- Panel Siaran / Sesi Live: minimal session bookkeeping so order
-- creation can attribute an order to a specific live-selling session,
-- not just a host. No real streaming integration - just start/end
-- timestamps for attribution and reporting.
-- =========================================================

CREATE TABLE live_sessions (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id),
    label VARCHAR(150) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX idx_live_sessions_host ON live_sessions(host_id);

ALTER TABLE order_items ADD COLUMN live_session_id INT REFERENCES live_sessions(id);
