-- =========================================================
-- Shipping couriers (pengiriman): reference data, managed via
-- Settings, replaces the old hardcoded shipping_method enum.
-- =========================================================

CREATE TABLE shipping_couriers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO shipping_couriers (name) VALUES
    ('JNE'), ('J&T'), ('SiCepat'), ('AnterAja'), ('Kurir Toko');
