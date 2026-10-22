-- =========================================================
-- Adjust #125 Multi-Supplier Support: one existing SKU (variant) can be bought from several
-- suppliers without creating a new SKU. This replaces the "1 Product Code = 1 Supplier" rule of
-- 062_products_supplier.sql; products.supplier_id stays as the product's default supplier and is
-- only the fallback when a variant has no linked supplier of its own.
--   supplier_product_code  the supplier's own code for the item
--   url_1688               the 1688 listing
--   ref_price / currency   reference purchase price (defaults a new PO / PR line's unit cost)
--   is_preferred           the supplier picked by default (at most one per variant)
-- =========================================================

CREATE TABLE variant_suppliers (
    id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    supplier_product_code VARCHAR(100),
    url_1688 TEXT,
    ref_price NUMERIC(14,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'RMB',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_preferred BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (variant_id, supplier_id)
);
CREATE UNIQUE INDEX uq_variant_suppliers_preferred ON variant_suppliers(variant_id) WHERE is_preferred;
CREATE INDEX idx_variant_suppliers_supplier ON variant_suppliers(supplier_id);

-- Every variant of a product with a supplier gets that supplier as its preferred link, with the
-- product's vendor code and the last price paid to that supplier for the variant as reference.
INSERT INTO variant_suppliers (variant_id, supplier_id, supplier_product_code, ref_price, is_preferred)
SELECT pv.id, p.supplier_id, NULLIF(p.vendor_sku, ''),
       (SELECT pi.unit_cost FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pi.variant_id = pv.id AND pu.supplier_id = p.supplier_id AND pu.status <> 'cancelled'
        ORDER BY pu.created_at DESC, pi.id DESC LIMIT 1),
       true
FROM product_variants pv JOIN products p ON p.id = pv.product_id
WHERE p.supplier_id IS NOT NULL;
