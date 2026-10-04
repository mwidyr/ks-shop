-- Promotions module v1: Coupon Code (fixed amount / percentage / free shipping) only.
-- Buy-A-Get-B, Add-on Deal and Multi-color Combo Price are explicitly out of scope - they need
-- per-item trigger/reward logic this schema doesn't attempt. The pre-existing store-wide
-- free-shipping threshold (app_settings.free_shipping_threshold_*, used by ComputeShippingFee in
-- shipping_fee.go) is left untouched and keeps working exactly as it does today; it is NOT
-- migrated into this table, so `code` is effectively required for every promotion created through
-- this module for now even though the column allows NULL for a possible future auto-apply case.
CREATE TABLE promotions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('fixed_amount', 'percentage', 'free_shipping')),
    value NUMERIC(14,2) NOT NULL DEFAULT 0,
    min_order_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    usage_limit INT,
    per_customer_limit INT,
    combinable BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_promotions_code ON promotions(code) WHERE code IS NOT NULL;

-- One row per order a promotion was actually applied to - drives usage_limit/per_customer_limit
-- enforcement and lets a cancelled order's usage be released back (see orders.go UpdateStatus).
CREATE TABLE promotion_redemptions (
    id SERIAL PRIMARY KEY,
    promotion_id INT NOT NULL REFERENCES promotions(id),
    order_id INT NOT NULL REFERENCES orders(id),
    customer_id INT REFERENCES customers(id),
    discount_applied NUMERIC(14,2) NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(promotion_id, order_id)
);

ALTER TABLE orders ADD COLUMN promotion_id INT REFERENCES promotions(id);
ALTER TABLE orders ADD COLUMN promotion_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
