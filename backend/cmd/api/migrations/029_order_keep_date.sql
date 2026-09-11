-- =========================================================
-- Keep Order: a nullable date on the order itself (no separate boolean -
-- presence of a date means "kept"). An order becomes eligible for the
-- picking queue starting 1 day before keep_date, computed at query time
-- rather than via a scheduled job (consistent with this app's existing
-- "computed, not stored" convention for derived facts).
-- =========================================================

ALTER TABLE orders ADD COLUMN keep_date DATE;
