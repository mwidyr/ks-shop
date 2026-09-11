-- =========================================================
-- Shipping Data Export: track whether/when an order's shipping data has
-- been exported to the carrier, and its resulting tracking number, so the
-- export screen can show "Sudah diekspor" / "belum ada nomor" and avoid
-- silently re-exporting an already-shipped order.
-- =========================================================

ALTER TABLE orders ADD COLUMN exported_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
