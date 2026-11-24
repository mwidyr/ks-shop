-- Holding area for chunked store-sync uploads. The scraper sends a snapshot in pieces small enough
-- for nginx's default 1 MB body limit; pieces land here and are applied to cvs_stores in ONE
-- transaction per chain once the final "commit" request arrives and the staged count matches.
-- Rows left behind by an interrupted run are purged after a day.
CREATE TABLE cvs_sync_staging (
    session TEXT NOT NULL,
    chain_type VARCHAR(20) NOT NULL,
    store_code VARCHAR(10) NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    store_addr VARCHAR(200) NOT NULL DEFAULT '',
    store_phone VARCHAR(30) NOT NULL DEFAULT '',
    city VARCHAR(20) NOT NULL DEFAULT '',
    district VARCHAR(20) NOT NULL DEFAULT '',
    longitude DOUBLE PRECISION,
    latitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session, chain_type, store_code)
);
CREATE INDEX idx_cvs_sync_staging_created ON cvs_sync_staging (created_at);
