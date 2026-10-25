-- =========================================================
-- Adjust #143: manual Start LIVE. A row is one manual session of a host: it makes the host LIVE right away,
-- outside or inside the schedule, until staff press End LIVE (ended_at) or expires_at passes (12 hours after
-- the start, so a forgotten session does not keep a host LIVE forever). It never touches the shift hours or
-- working days. End LIVE keeps using host_live_ends (101_live_schedule.sql) to stop the scheduled window that is
-- running, so after a manual end the same shift does not switch the host back to LIVE.
-- =========================================================

CREATE TABLE host_live_manual (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    started_by INT REFERENCES users(id),
    ended_by INT REFERENCES users(id)
);
CREATE INDEX idx_host_live_manual_host ON host_live_manual(host_id, started_at DESC);
