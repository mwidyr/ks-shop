-- Website Sales Attribution (Customer Management PDF, item 10): every Website order belongs to
-- exactly ONE category - a specific Affiliate (affiliate_id set), "Website - Created by CS"
-- (staff keyed it in, no affiliate), or "Website - Self-Service" (the customer ordered on the
-- website themselves, no affiliate). website_source holds the last two; an Affiliate order leaves
-- it NULL (the affiliate takes precedence, so it is never also counted under CS / Self-Service).
-- LIVE orders leave it NULL.
ALTER TABLE orders ADD COLUMN website_source VARCHAR(20) CHECK (website_source IN ('cs', 'self_service'));

-- Backfill: website orders keyed in by staff carry a sales user; storefront orders have none.
UPDATE orders SET website_source = CASE WHEN sales_id IS NULL THEN 'self_service' ELSE 'cs' END
WHERE sales_channel = 'website' AND affiliate_id IS NULL;

CREATE INDEX idx_orders_website_source ON orders(website_source) WHERE website_source IS NOT NULL;
