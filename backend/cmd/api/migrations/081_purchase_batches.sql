-- Purchases / Purchase Requisitions change requirements (PDF):
--  * a Purchase Order item can be received in several delivery batches (China split shipments);
--  * each batch is confirmed on its own: Incoming -= actual received, Actual Stock += actual received,
--    and any shortfall stays in Incoming (a PO is Received only when nothing is left in Incoming);
--  * a PR supplier group's notes become a log (added one by one, editable at any time).

CREATE TABLE purchase_item_batches (
    id SERIAL PRIMARY KEY,
    purchase_item_id INT NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
    batch_no INT NOT NULL,
    planned_qty INT NOT NULL DEFAULT 0 CHECK (planned_qty >= 0),
    received_qty INT CHECK (received_qty IS NULL OR received_qty >= 0),
    is_received BOOLEAN NOT NULL DEFAULT false,
    received_at TIMESTAMPTZ,
    received_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (purchase_item_id, batch_no)
);
CREATE INDEX idx_purchase_item_batches_item ON purchase_item_batches(purchase_item_id);

-- Every existing PO item gets exactly one batch. Open POs: an unreceived batch for the full qty.
-- Already-received POs: a received batch holding what was actually received (the old whole-PO
-- receive already moved the stock, so this backfill must not and does not touch stock).
INSERT INTO purchase_item_batches (purchase_item_id, batch_no, planned_qty, received_qty, is_received, received_at)
SELECT pi.id, 1, pi.qty,
       CASE WHEN p.status = 'received' THEN COALESCE(pi.received_qty, pi.qty) END,
       p.status = 'received',
       CASE WHEN p.status = 'received' THEN p.received_at END
FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id;

-- status 'partially_received' is app-level (purchases.status has no CHECK constraint).

CREATE TABLE purchase_requisition_supplier_notes (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL REFERENCES purchase_requisition_suppliers(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pr_supplier_notes_group ON purchase_requisition_supplier_notes(group_id);

INSERT INTO purchase_requisition_supplier_notes (group_id, note)
SELECT id, notes FROM purchase_requisition_suppliers WHERE notes IS NOT NULL AND btrim(notes) <> '';
