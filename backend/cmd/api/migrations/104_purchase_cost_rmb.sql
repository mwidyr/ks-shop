-- =========================================================
-- Adjust #126, #133, #134, #135: purchasing costs are recorded in RMB only.
--   purchases.exchange_rate      TWD per 1 RMB, entered per PO. Never shown as a converted price
--                                anywhere in the ERP - only used in the background to value the
--                                FIFO cost layers (105_fifo_cost.sql) when goods are received.
--   discount/shipping/extra      whole-order adjustments so the PO total matches the supplier
--                                invoice. They are spread over the lines pro rata by line value
--                                (landed unit cost); the agreed unit_cost itself is untouched.
--   purchase_requisition_suppliers gets the same fields so they are agreed before the PO exists.
--   purchase_items.supplier_product_code  the supplier's code for the line, saved on the PO.
--   products.cost_rmb            the default (reference) cost in Product Management, in RMB. It is
--                                updated when a PO is finalized (ordered) with a different price;
--                                product_cost_history keeps every change. products.cost (TWD,
--                                052_product_cost.sql) is no longer edited or shown.
-- =========================================================

ALTER TABLE purchases
    ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'RMB',
    ADD COLUMN exchange_rate NUMERIC(12,6) CHECK (exchange_rate IS NULL OR exchange_rate > 0),
    ADD COLUMN discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    ADD COLUMN shipping_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
    ADD COLUMN extra_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (extra_amount >= 0);

ALTER TABLE purchase_requisition_suppliers
    ADD COLUMN exchange_rate NUMERIC(12,6) CHECK (exchange_rate IS NULL OR exchange_rate > 0),
    ADD COLUMN discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    ADD COLUMN shipping_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
    ADD COLUMN extra_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (extra_amount >= 0);

ALTER TABLE purchase_items ADD COLUMN supplier_product_code VARCHAR(100);

ALTER TABLE products ADD COLUMN cost_rmb NUMERIC(14,2) NOT NULL DEFAULT 0;

-- PO unit costs have always been entered in RMB (the PO/PR pages show them as CNY), so the last
-- price paid for a product is its starting RMB default cost.
UPDATE products p SET cost_rmb = x.unit_cost
FROM (
    SELECT DISTINCT ON (pv.product_id) pv.product_id, pi.unit_cost
    FROM purchase_items pi
    JOIN purchases pu ON pu.id = pi.purchase_id
    JOIN product_variants pv ON pv.id = pi.variant_id
    WHERE pu.status <> 'cancelled' AND pi.unit_cost > 0
    ORDER BY pv.product_id, pu.created_at DESC, pi.id DESC
) x
WHERE x.product_id = p.id;

CREATE TABLE product_cost_history (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_cost NUMERIC(14,2) NOT NULL,
    new_cost NUMERIC(14,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'RMB',
    source VARCHAR(20) NOT NULL,        -- purchase_order | manual
    purchase_id INT REFERENCES purchases(id) ON DELETE SET NULL,
    changed_by INT REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_cost_history_product ON product_cost_history(product_id, changed_at DESC);
