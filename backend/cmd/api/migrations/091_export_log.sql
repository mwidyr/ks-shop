-- Riwayat export logistik: tiap export (termasuk re-export) menambah satu baris, tidak menimpa
-- yang lama. orders.exported_at tetap menyimpan waktu export PERTAMA (dipakai sebagai penanda
-- "terkunci" untuk order yang sudah masuk proses logistik).
CREATE TABLE IF NOT EXISTS order_export_log (
    id          BIGSERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider    VARCHAR(20) NOT NULL,           -- chain_type: cvs_711 | cvs_familymart | courier
    exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     INT REFERENCES users(id),
    is_reexport BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_order_export_log_order ON order_export_log(order_id, exported_at DESC);
