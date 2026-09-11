-- =========================================================
-- Merge Orders: a non-destructive "shipment group" linking table, NOT a
-- reverse-Split (physically moving order_items between orders). Moving
-- items would re-attribute the losing order's sales_id (an order-level
-- column) to the surviving order, breaking "attribution unchanged" and
-- "no double-counting" - every Dashboard/Reports query aggregates
-- per-order. Instead, orders/order_items are never touched; grouping is
-- purely a shipping-time concept, so every existing report keeps working
-- unchanged for free.
-- =========================================================

CREATE TABLE order_shipment_groups (
    id SERIAL PRIMARY KEY,
    shipping_fee_order_id INT NOT NULL REFERENCES orders(id),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_shipment_group_members (
    group_id INT NOT NULL REFERENCES order_shipment_groups(id) ON DELETE CASCADE,
    order_id INT NOT NULL UNIQUE REFERENCES orders(id),
    PRIMARY KEY (group_id, order_id)
);
