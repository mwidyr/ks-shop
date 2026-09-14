-- Master SKU / product code, distinct from each variant's own sku. Nullable - existing
-- products won't have one yet, and Postgres allows multiple NULLs under a UNIQUE constraint.
ALTER TABLE products ADD COLUMN sku VARCHAR(50) UNIQUE;
