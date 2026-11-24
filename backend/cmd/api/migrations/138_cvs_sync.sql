-- Daily 7-ELEVEN / FamilyMart store sync (ralulu-store-sync scraper -> POST /api/internal/cvs-sync).
-- The scraper only ever upserts into cvs_stores (never deletes), so a store that disappears from
-- the source stays in place; last_seen_at lets staff review stale rows before anything is retired.
ALTER TABLE cvs_stores
    ADD COLUMN IF NOT EXISTS city VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS district VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- One row per chain per scraper run: feeds the monitoring panel on the Audit Logs page.
CREATE TABLE cvs_sync_runs (
    id SERIAL PRIMARY KEY,
    chain_type VARCHAR(20) NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    applied BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    store_count INT NOT NULL DEFAULT 0,
    previous_count INT,
    change_pct NUMERIC(7,2),
    error_count INT NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    upload_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_cvs_sync_runs_chain ON cvs_sync_runs (chain_type, id DESC);
