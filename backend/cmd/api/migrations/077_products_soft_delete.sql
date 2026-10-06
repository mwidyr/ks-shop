-- Super Admin hard-delete with order history, as a soft-delete/archive rather than an actual
-- row removal (item 074) - preserves order_items/stock_movements FK integrity and historical
-- reports/analytics, which all still JOIN against the now-archived products row unaffected.
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
