-- Test/demo data for Product Cost (item 012): without this, every existing product's cost
-- defaults to 0 from migration 052, so Gross Profit would just equal Gross Sales everywhere -
-- nothing to actually see on the Profit page or verify the admin-only gating against.
--
-- This sets a plausible cost (60% of base_price, a common margin assumption) on every product
-- that doesn't have one yet. Only touches cost = 0 rows, so it's safe to run even if some
-- products already had a real cost entered by an admin through the UI by the time this runs -
-- those are left untouched. Runs once (tracked in schema_migrations like every other migration
-- here), so it won't re-apply or overwrite a value an admin edits afterward.
UPDATE products
SET cost = ROUND(base_price * 0.6, 2)
WHERE cost = 0 AND base_price > 0;
