-- Purchase Requisition unit costs are CNY only. Lines added while a supplier link carried a TWD reference
-- price picked that TWD number up as the CNY cost (e.g. one product at ¥81 on some colors and ¥17 on others).
-- Reset those lines on requisitions that are still drafts to the product's default CNY cost
-- (Product Management); with no CNY cost on the product the line is left empty to be filled in.
UPDATE purchase_requisition_items pri
SET unit_cost = (SELECT NULLIF(p.cost_rmb, 0) FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = pri.variant_id)
FROM purchase_requisition_suppliers prs
JOIN purchase_requisitions pr ON pr.id = prs.requisition_id
WHERE prs.id = pri.requisition_supplier_id
  AND pr.status = 'draft'
  AND EXISTS (SELECT 1 FROM variant_suppliers vs
              WHERE vs.variant_id = pri.variant_id AND vs.supplier_id = prs.supplier_id
                AND vs.currency <> 'RMB' AND vs.ref_price = pri.unit_cost);
