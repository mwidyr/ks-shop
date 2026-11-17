-- 7-ELEVEN exception reports (Shipping Workbench -> Cross-Batch Import):
--  * label_expired_at   - the platform cancelled the shipping label (類別：取消訂單). The platform order no. and shipping no. are
--                         cleared, the order keeps its status, stock allocation and its batch, and waits for new numbers.
--  * label_reissued_at  - new numbers were imported: the order must be sent to the 3PL again (priority file) before the flag clears.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_expired_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_reissued_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_label_expired  ON orders (label_expired_at)  WHERE label_expired_at  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_label_reissued ON orders (label_reissued_at) WHERE label_reissued_at IS NOT NULL;
-- the numbers that expired: a later import of an old file must not hand them back to the order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_platform_no VARCHAR(60);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_shipping_no VARCHAR(60);
