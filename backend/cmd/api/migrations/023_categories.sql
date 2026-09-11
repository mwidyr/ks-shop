-- =========================================================
-- Categories as a first-class, staff-managed list (Manajemen Kategori)
-- instead of purely deriving options from existing products.
-- products.category stays free text (unchanged) - this table is the
-- authoritative source for the dropdown/add-new UI and its own CRUD
-- page; it is seeded from whatever category values already exist.
-- =========================================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (name)
SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (name) DO NOTHING;
