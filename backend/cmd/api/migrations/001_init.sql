-- =========================================================
-- Order Management System - Initial Schema
-- =========================================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) UNIQUE NOT NULL
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    role_id INT NOT NULL REFERENCES roles(id),
    customer_id INT REFERENCES customers(id), -- only set when role = customer
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(60) UNIQUE NOT NULL,
    color VARCHAR(50),
    size VARCHAR(20),
    price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_buckets (
    variant_id INT PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    available_stock INT NOT NULL DEFAULT 0,
    reserve_stock INT NOT NULL DEFAULT 0,
    order_stock INT NOT NULL DEFAULT 0, -- outside total_stock formula
    promo_stock INT NOT NULL DEFAULT 0,
    safety_stock INT NOT NULL DEFAULT 0,
    broken_stock INT NOT NULL DEFAULT 0
);

CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    order_id INT,
    bucket_from VARCHAR(30),
    bucket_to VARCHAR(30),
    qty INT NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    user_id INT REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE carts (
    id SERIAL PRIMARY KEY,
    sales_id INT REFERENCES users(id),
    customer_id INT REFERENCES customers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, checkout, completed, expired, cancelled
    checkout_started_at TIMESTAMPTZ,
    checkout_last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    qty INT NOT NULL,
    host_sales_id INT REFERENCES users(id), -- attribution per item
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(30) UNIQUE NOT NULL,
    cart_id INT REFERENCES carts(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    sales_id INT REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, confirm, packing, picking, shipped, delivered, cancelled, return
    shipping_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    qty INT NOT NULL,
    price_at_order NUMERIC(14,2) NOT NULL,
    host_sales_id INT REFERENCES users(id)
);

CREATE TABLE order_status_log (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status_from VARCHAR(20),
    status_to VARCHAR(20) NOT NULL,
    changed_by INT REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);
