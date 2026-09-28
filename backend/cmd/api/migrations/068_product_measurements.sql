-- =========================================================
-- Item 034: optional garment measurement fields on Product Management.
-- Plain text (not numeric) so a single value ("110cm") or a range
-- ("90-120cm") both work, per spec. All optional.
-- =========================================================

ALTER TABLE products ADD COLUMN measurement_bust VARCHAR(50);
ALTER TABLE products ADD COLUMN measurement_waist VARCHAR(50);
ALTER TABLE products ADD COLUMN measurement_length VARCHAR(50);
ALTER TABLE products ADD COLUMN measurement_bottom_length VARCHAR(50);
ALTER TABLE products ADD COLUMN measurement_elasticity VARCHAR(50);
ALTER TABLE products ADD COLUMN measurement_note TEXT;
