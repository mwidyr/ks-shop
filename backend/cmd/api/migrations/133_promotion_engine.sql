-- Promotion engine: CS-only promotions, auto-applied product promotions (Buy A Get B, Add-on, Combo) and several
-- promotions per order. Existing coupons keep working unchanged (audience 'public', no auto-apply).
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_type_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_type_check
    CHECK (type IN ('fixed_amount', 'percentage', 'free_shipping', 'buy_a_get_b', 'addon', 'combo'));
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS name VARCHAR(120);
-- cs_only promotions are never shown on the website and cannot be redeemed by a customer; CS picks them on an order.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'cs_only'));
-- auto_apply promotions need no code: they apply whenever the cart qualifies.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN NOT NULL DEFAULT false;
-- rules of the product promotions (trigger / reward / combo pool ...), see promo_engine.go
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

-- who applied a promotion by hand and why (private_offer / after_sales / compensation)
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS applied_by INT REFERENCES users(id);
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS reason VARCHAR(20);

-- a free gift (Buy A Get B) is an order item at price 0
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promotion_id INT REFERENCES promotions(id);

-- what CS chose on an order, so changing its items later recomputes the same promotions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_excluded INT[] NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_gifts JSONB NOT NULL DEFAULT '{}';
