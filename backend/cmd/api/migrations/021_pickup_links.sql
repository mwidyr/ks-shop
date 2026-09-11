-- =========================================================
-- Manajemen Logistik -> Tautan Pickup: a labeled, shareable link staff
-- can generate (e.g. per host-live session) that resolves to a simple
-- public "your order is ready" status page.
-- =========================================================

CREATE TABLE pickup_links (
    id SERIAL PRIMARY KEY,
    token VARCHAR(40) UNIQUE NOT NULL,
    label VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'perlu_diproses',
    -- perlu_diproses, menunggu_pilih, selesai, kedaluwarsa, batal
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_pickup_links_status ON pickup_links(status);
