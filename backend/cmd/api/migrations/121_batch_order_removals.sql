-- Failed orders can be edited and taken out of their shipping batch (back to Pending). shipping_batch_orders
-- keeps at most one batch per order, so the removal is recorded here to keep the batch's history.
CREATE TABLE IF NOT EXISTS shipping_batch_removals (
    id          SERIAL PRIMARY KEY,
    batch_id    INT NOT NULL REFERENCES shipping_batches(id) ON DELETE CASCADE,
    order_id    INT NOT NULL REFERENCES orders(id),
    removed_by  INT REFERENCES users(id),
    last_error  TEXT,
    removed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_batch_removals_batch ON shipping_batch_removals(batch_id);
CREATE INDEX IF NOT EXISTS idx_shipping_batch_removals_order ON shipping_batch_removals(order_id);
