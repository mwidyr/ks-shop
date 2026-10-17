-- =========================================================
-- Shipping Workbench, step 3: shipping batches.
--   shipping_batches        one row per batch (provider = pickup_chains.chain_type)
--   shipping_batch_orders   the batch's original order list; an order belongs to at most ONE batch
--                           (UNIQUE order_id). seq keeps the export-file row order. create_result
--                           is the platform's verdict: NULL = not known yet, 'created', 'failed'.
--   orders.platform_order_no  the shipping platform's own order number (7-11 CM..., FamilyMart
--                           訂單編號). orders.tracking_number (existing) holds the shipping number
--                           (7-11 配送單編號 G..., FamilyMart 寄件編號).
--   order_export_log.batch_id/kind  which batch and which kind of export (initial, retry,
--                           3pl_packing, 3pl_sticker) each download belongs to.
-- Stock allocation is DERIVED from these rows (see shipping_alloc.go), never stored.
-- =========================================================

CREATE TABLE IF NOT EXISTS shipping_batches (
    id          SERIAL PRIMARY KEY,
    batch_no    VARCHAR(40) NOT NULL UNIQUE,
    provider    VARCHAR(20) NOT NULL,                -- cvs_711 | cvs_familymart | courier
    created_by  INT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_batches_provider ON shipping_batches(provider, created_at DESC);

CREATE TABLE IF NOT EXISTS shipping_batch_orders (
    id            SERIAL PRIMARY KEY,
    batch_id      INT NOT NULL REFERENCES shipping_batches(id) ON DELETE CASCADE,
    order_id      INT NOT NULL UNIQUE REFERENCES orders(id),
    seq           INT NOT NULL,
    create_result VARCHAR(10),                       -- NULL | created | failed
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_batch_orders_batch ON shipping_batch_orders(batch_id, seq);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_order_no TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_platform_order_no ON orders(platform_order_no) WHERE platform_order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

ALTER TABLE order_export_log ADD COLUMN IF NOT EXISTS batch_id INT REFERENCES shipping_batches(id);
ALTER TABLE order_export_log ADD COLUMN IF NOT EXISTS kind VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_order_export_log_batch ON order_export_log(batch_id, kind);
