-- 1) The promotion typed as a code is remembered on the order, so editing the order later keeps it
--    (a public code is valid on LIVE orders when typed; only picking it from the CS list is Website-only).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_typed_code VARCHAR(30);

-- 2) Promotion Purposes: editable list shown in the CS order forms. A purpose is never deleted, only disabled, and
--    every usage record keeps a copy of the purpose name it had, so renaming one never changes history.
CREATE TABLE IF NOT EXISTS promotion_purposes (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(80) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    -- the purpose recorded for automatic promotions and customer-typed codes; it can be renamed, never disabled
    is_system  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO promotion_purposes (name, sort_order, is_system)
SELECT v.name, v.sort_order, v.is_system FROM (VALUES
    ('General Promotion', 1, true), ('Customer Compensation', 2, false), ('Special Discount', 3, false), ('Other', 4, false)
) AS v(name, sort_order, is_system)
WHERE NOT EXISTS (SELECT 1 FROM promotion_purposes);

ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS purpose_id INT REFERENCES promotion_purposes(id);
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS purpose_name VARCHAR(80);
-- 3) A cancelled order keeps its usage record (history), marked here; it no longer counts as used.
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- earlier records used a fixed list of reasons
UPDATE promotion_redemptions pr SET purpose_id = pp.id, purpose_name = pp.name
FROM promotion_purposes pp
WHERE pr.purpose_id IS NULL AND pr.reason IS NOT NULL
  AND pp.name = CASE pr.reason WHEN 'private_offer' THEN 'Special Discount' ELSE 'Customer Compensation' END;
-- every other record is a General Promotion (automatic promotion or typed code)
UPDATE promotion_redemptions pr SET purpose_id = pp.id, purpose_name = pp.name
FROM promotion_purposes pp
WHERE pr.purpose_id IS NULL AND pp.is_system;

-- orders cancelled before this change lost their usage record: rebuild it from the order (kept as cancelled history)
INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, discount_applied, redeemed_at, purpose_id, purpose_name, cancelled_at)
SELECT o.promotion_id, o.id, o.customer_id, o.promotion_discount_amount, o.created_at, pp.id, pp.name, o.updated_at
FROM orders o CROSS JOIN (SELECT id, name FROM promotion_purposes WHERE is_system LIMIT 1) pp
WHERE o.status = 'cancelled' AND o.promotion_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM promotion_redemptions r WHERE r.order_id = o.id AND r.promotion_id = o.promotion_id);

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_order ON promotion_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_redeemed ON promotion_redemptions(redeemed_at);
