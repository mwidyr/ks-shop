-- Keep order: the date can now be either the SHIPPING date (order is exportable 1 day before it)
-- or the customer's EXPECTED DELIVERY date (shipping date = date - 3 days, exportable 4 days before it).
-- Existing kept orders stay on the original workflow ('shipping').
ALTER TABLE orders ADD COLUMN IF NOT EXISTS keep_date_type TEXT NOT NULL DEFAULT 'shipping'
    CHECK (keep_date_type IN ('shipping', 'delivery'));
CREATE INDEX IF NOT EXISTS idx_orders_keep_date ON orders (keep_date) WHERE keep_date IS NOT NULL;
