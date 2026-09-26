-- =========================================================
-- Supplier Profile rework (item: Supplier & Purchase Management additional
-- requirements): one profile page per supplier holding everything about
-- them. `status` (active/paused/inactive) replaces the old boolean
-- `is_active` - a paused supplier still has history but shouldn't be
-- picked for new purchases, distinct from inactive/retired.
-- =========================================================

ALTER TABLE suppliers ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'; -- active, paused, inactive
UPDATE suppliers SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
ALTER TABLE suppliers DROP COLUMN is_active;

ALTER TABLE suppliers ADD COLUMN source VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN category VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN customizable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE suppliers ADD COLUMN payment_method VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN default_lead_time_days INT; -- used later by Replenishment Planning

-- Purchase Rules, supplier-level defaults. Product-level overrides live in
-- product_purchase_rules (062_products_supplier.sql) and take priority.
ALTER TABLE suppliers ADD COLUMN min_order_qty INT;
ALTER TABLE suppliers ADD COLUMN min_color_qty INT;
ALTER TABLE suppliers ADD COLUMN min_order_amount NUMERIC(14,2);
ALTER TABLE suppliers ADD COLUMN order_multiple INT;
ALTER TABLE suppliers ADD COLUMN mixed_color_allowed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE suppliers ADD COLUMN pack_set_qty INT;

-- Contacts: a supplier can have several (name + method + value), unlike the
-- old single contact_name/phone pair (kept as-is for backward compatibility,
-- new profiles should use this table instead).
CREATE TABLE supplier_contacts (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    contact_name VARCHAR(150),
    method VARCHAR(20) NOT NULL DEFAULT 'other', -- wechat, phone, whatsapp, other
    value VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_contacts_supplier ON supplier_contacts(supplier_id);

-- Notes: a timestamped log, not a single free-text field.
CREATE TABLE supplier_notes (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_notes_supplier ON supplier_notes(supplier_id);

-- Price Reference: approximate price range by category, reference only -
-- explicitly does not participate in cost calculations per spec.
CREATE TABLE supplier_price_references (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    price_min NUMERIC(14,2),
    price_max NUMERIC(14,2)
);
CREATE INDEX idx_supplier_price_references_supplier ON supplier_price_references(supplier_id);
