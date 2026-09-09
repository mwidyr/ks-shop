-- =========================================================
-- Product active/inactive status + multi-photo support
-- (up to 5 photos per product, managed as an ordered gallery).
-- =========================================================

ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

INSERT INTO product_images (product_id, url, sort_order)
SELECT id, image_url, 0 FROM products WHERE image_url IS NOT NULL AND image_url <> '';

ALTER TABLE products DROP COLUMN image_url;
