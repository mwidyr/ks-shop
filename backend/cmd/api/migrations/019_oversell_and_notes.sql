-- =========================================================
-- Intentional oversell support, per-item picking progress, and the
-- order-detail extras (internal notes + attachments) needed to match
-- the reference's richer order-detail layout.
-- =========================================================

ALTER TABLE products ADD COLUMN allow_oversell BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE order_items ADD COLUMN picked_qty INT NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN internal_notes TEXT;

CREATE TABLE order_attachments (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_attachments_order ON order_attachments(order_id);
