-- Purchase Requisitions - Adjustments PDF: the new REQ Detail header needs a "Last Updated"
-- timestamp and a requisition-level Note (distinct from each Supplier group's own note).
ALTER TABLE purchase_requisitions
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN note TEXT;
