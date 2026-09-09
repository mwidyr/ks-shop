-- =========================================================
-- Hosts (live-selling hosts): reference data only, no login.
-- Managed via Settings.
-- =========================================================

CREATE TABLE hosts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    platform VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosts_active ON hosts(is_active);

INSERT INTO hosts (name, platform) VALUES
    ('Reni', 'TikTok'),
    ('Tasya', 'TikTok'),
    ('Nabila', 'Shopee'),
    ('Gofar', 'Instagram'),
    ('Budi', 'TikTok');
