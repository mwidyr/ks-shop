-- =========================================================
-- Adjust #138, #139, #141.
--   customer_notes          #138: internal staff notes on a customer profile (added one by one,
--                           editable and deletable), same pattern as supplier / PR supplier notes.
--   product_size_chart      #139: a free size chart per product - any size name (S, Free Size,
--                           26 ...), each row with the same optional measurement fields as before.
--                           Independent of variants / stock. The old single set of measurement_*
--                           columns becomes the first row (size left empty) and is no longer used.
--   product_variants.oversell_limit  #141: with allow_oversell on, NULL = unlimited, a number X =
--                           a staff/live order may take Available down to -X at most.
-- =========================================================

CREATE TABLE customer_notes (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_notes_customer ON customer_notes(customer_id, created_at);

CREATE TABLE product_size_chart (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    size_label VARCHAR(50) NOT NULL DEFAULT '',
    bust VARCHAR(50) NOT NULL DEFAULT '',
    waist VARCHAR(50) NOT NULL DEFAULT '',
    length VARCHAR(50) NOT NULL DEFAULT '',
    bottom_length VARCHAR(50) NOT NULL DEFAULT '',
    elasticity VARCHAR(50) NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_product_size_chart_product ON product_size_chart(product_id, sort_order);

INSERT INTO product_size_chart (product_id, sort_order, bust, waist, length, bottom_length, elasticity, note)
SELECT id, 0, COALESCE(measurement_bust,''), COALESCE(measurement_waist,''), COALESCE(measurement_length,''),
       COALESCE(measurement_bottom_length,''), COALESCE(measurement_elasticity,''), COALESCE(measurement_note,'')
FROM products
WHERE COALESCE(measurement_bust,'') <> '' OR COALESCE(measurement_waist,'') <> '' OR COALESCE(measurement_length,'') <> ''
   OR COALESCE(measurement_bottom_length,'') <> '' OR COALESCE(measurement_elasticity,'') <> '' OR COALESCE(measurement_note,'') <> '';

ALTER TABLE product_variants ADD COLUMN oversell_limit INT CHECK (oversell_limit IS NULL OR oversell_limit >= 0);
