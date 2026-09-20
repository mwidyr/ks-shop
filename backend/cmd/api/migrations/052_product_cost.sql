-- Product Cost: a product-level reference cost, admin-only (super_user), distinct from each
-- variant's operational cost_price (product_variants.cost_price, live-updated by every
-- purchase receipt and already visible/editable to non-admin purchasing staff). Used for
-- Gross Profit = Sales Revenue - Product Cost, an admin-only figure on the Profit page.
ALTER TABLE products ADD COLUMN cost NUMERIC(14,2) NOT NULL DEFAULT 0;
