-- =========================================================
-- "Purchase Requisition & Procurement Workflow" PDF: a planning layer in
-- front of the existing Purchase Order system (purchases/purchase_items,
-- migration 063). Users pick Products first (not Suppliers); the system
-- auto-detects each product's supplier and groups items into per-supplier
-- draft groups; each group is confirmed (qty/cost/dates) independently;
-- submitting the whole requisition creates one real `purchases` row per
-- confirmed group, reusing the existing PO create/receive/history flow
-- entirely unchanged - this is a planning UI, not a parallel system.
-- =========================================================

CREATE TABLE purchase_requisitions (
    id SERIAL PRIMARY KEY,
    requisition_no VARCHAR(30) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, completed
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- One row per Supplier group within a requisition ("Supplier groups may be confirmed
-- individually", spec point 06). purchase_id is set once this group's real PO is created on
-- submission (point 10) - null while still draft/pending/confirmed.
CREATE TABLE purchase_requisition_suppliers (
    id SERIAL PRIMARY KEY,
    requisition_id INT NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending_contact', -- pending_contact, confirmed
    expected_ship_date DATE,
    actual_ship_date DATE,
    expected_arrival_date DATE,
    notes TEXT,
    purchase_id INT REFERENCES purchases(id),
    UNIQUE (requisition_id, supplier_id)
);

-- Planned QTY vs Confirmed QTY are kept as separate values (spec point 07): Planned is the
-- original ask and never overwritten; Confirmed is what the Supplier actually committed to and
-- becomes the real PO's Ordered QTY on submission. unit_cost defaults from the product's own
-- cost_price when the group is opened for confirmation, editable per spec point 08.
CREATE TABLE purchase_requisition_items (
    id SERIAL PRIMARY KEY,
    requisition_supplier_id INT NOT NULL REFERENCES purchase_requisition_suppliers(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    planned_qty INT NOT NULL,
    confirmed_qty INT,
    unit_cost NUMERIC(14,2),
    UNIQUE (requisition_supplier_id, variant_id)
);

CREATE INDEX idx_pr_suppliers_requisition ON purchase_requisition_suppliers(requisition_id);
CREATE INDEX idx_pr_items_requisition_supplier ON purchase_requisition_items(requisition_supplier_id);

-- Dedicated tab_key (not reusing 'purchases') so the sidebar shows its own "Purchase
-- Requisitions" title/nav entry - same access level as the adjacent 'purchases' tab.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'management', 'purchase_requisitions', 'edit'
UNION ALL
SELECT r, 'purchase_requisitions', 'view' FROM unnest(ARRAY['spv', 'sales']) AS r
ON CONFLICT (role_name, tab_key) DO NOTHING;
