-- Buyer reviews ("Ulasan pembeli"): one per delivered order line, shown on the product page once approved.
CREATE TABLE product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_item_id INT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT,
    display_name VARCHAR(60) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id, status, created_at DESC);
