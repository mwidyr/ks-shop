-- =========================================================
-- Purchase Order rework: explicit PO Number, Expected Arrival Date, a
-- richer 4-state status (was just waiting/received), a Change History
-- log for pre-receipt edits, and a received_qty per item so receiving
-- can differ from what was originally ordered (Supplier shortages etc).
-- =========================================================

ALTER TABLE purchases ADD COLUMN po_number VARCHAR(30) UNIQUE;
UPDATE purchases SET po_number = 'PO-' || LPAD(id::text, 5, '0') WHERE po_number IS NULL;
ALTER TABLE purchases ALTER COLUMN po_number SET NOT NULL;

ALTER TABLE purchases ADD COLUMN expected_arrival_date DATE;

-- Expand status: waiting -> ordered (same meaning, renamed to match the
-- spec's wording), plus a new pending_arrival step and a cancelled state.
UPDATE purchases SET status = 'ordered' WHERE status = 'waiting';
ALTER TABLE purchases ALTER COLUMN status SET DEFAULT 'ordered';
-- ordered, pending_arrival, received, cancelled

CREATE TABLE purchase_change_log (
    id SERIAL PRIMARY KEY,
    purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by INT REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT
);
CREATE INDEX idx_purchase_change_log_purchase ON purchase_change_log(purchase_id);

ALTER TABLE purchase_items ADD COLUMN received_qty INT;
