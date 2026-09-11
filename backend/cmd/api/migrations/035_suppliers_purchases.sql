-- =========================================================
-- Supplier & Purchase Management: basic supplier records + purchase
-- history (order date, product, qty, cost). A purchase moves from
-- 'waiting' to 'received'; on receipt, stock auto-increments and the
-- variant's cost_price is refreshed from the purchase cost, so purchase
-- data feeds directly into profit/cost analysis (already built on
-- product_variants.cost_price).
-- =========================================================

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(150),
    phone VARCHAR(30),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    order_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    notes TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_at TIMESTAMPTZ
);

CREATE TABLE purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    qty INT NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
