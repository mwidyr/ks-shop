-- Purchase Requisitions now have ONE editable quantity per line: Planned QTY (the client dropped
-- the separate Confirmed QTY input). Any line whose confirmed qty differed from planned keeps the
-- quantity that was actually going to be ordered (confirmed, which is also what an existing PO
-- was created with); confirmed_qty is no longer read or written.
UPDATE purchase_requisition_items SET planned_qty = confirmed_qty WHERE confirmed_qty IS NOT NULL AND confirmed_qty > 0;
UPDATE purchase_requisition_items SET confirmed_qty = NULL;
