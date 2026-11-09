-- Purchase Requisition Unit Cost comes from Product Cost (RMB) of Product Management - not from Base Price or a supplier
-- reference price. Lines of draft requisitions whose supplier group is not confirmed yet are brought in line (a confirmed
-- group keeps the price that was agreed). A product without a Product Cost keeps what the line has.
UPDATE purchase_requisition_items pri
SET unit_cost = p.cost_rmb
FROM purchase_requisition_suppliers prs, purchase_requisitions pr, product_variants pv, products p
WHERE prs.id = pri.requisition_supplier_id AND pr.id = prs.requisition_id
  AND pv.id = pri.variant_id AND p.id = pv.product_id
  AND pr.status = 'draft' AND prs.status <> 'confirmed'
  AND p.cost_rmb > 0 AND pri.unit_cost IS DISTINCT FROM p.cost_rmb;
