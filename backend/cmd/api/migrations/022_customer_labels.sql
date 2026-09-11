-- =========================================================
-- Manual, staff-assigned CRM labels (VIP/Daftar Hitam/Sering Retur/
-- Pelanggan Baru) - independent of the computed `segment` in
-- CustomerHandler.Stats, which stays an automatic insight.
-- =========================================================

CREATE TABLE customer_labels (
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, label)
);
