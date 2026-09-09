-- =========================================================
-- Seed Data: roles, sample users (all roles), customers, products
-- Default password for ALL sample users: password123
-- =========================================================

INSERT INTO roles (name) VALUES
    ('super_user'), ('management'), ('spv'), ('sales'), ('customer');

-- Password hash below = bcrypt("password123")
-- $2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy

INSERT INTO users (name, email, password_hash, role_id, is_active) VALUES
    ('Super Admin',      'superuser@demo.com',   '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='super_user'), true),
    ('Budi Management',  'management@demo.com',  '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='management'), true),
    ('Sari SPV',         'spv@demo.com',         '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='spv'), true),
    ('Andi Sales',       'sales1@demo.com',      '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='sales'), true),
    ('Dewi Sales',       'sales2@demo.com',      '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='sales'), true);

-- Sample customer + linked login account (customer portal)
INSERT INTO customers (name, phone, address) VALUES
    ('Rina Wijaya', '081234567890', 'Jl. Melati No. 10, Jakarta'),
    ('Joko Santoso', '081298765432', 'Jl. Kenanga No. 5, Bandung');

INSERT INTO users (name, email, password_hash, role_id, customer_id, is_active) VALUES
    ('Rina Wijaya', 'customer@demo.com', '$2b$10$.hWcmCDyKn.hg.dF9juAO.lDhw1LsIBi6jXsaYmyJ8ya1DqAaCjYy', (SELECT id FROM roles WHERE name='customer'), (SELECT id FROM customers WHERE phone='081234567890'), true);

-- =========================================================
-- Products (fashion / apparel store) with images (LoremFlickr - free tagged photos)
-- =========================================================

INSERT INTO products (name, description, category, image_url) VALUES
    ('Sneakers Classic White', 'Sepatu sneakers kulit sintetis, nyaman dipakai sehari-hari.', 'Sepatu', 'https://loremflickr.com/600/600/sneakers?lock=101'),
    ('Running Shoes Pro', 'Sepatu lari ringan dengan sol empuk untuk performa maksimal.', 'Sepatu', 'https://loremflickr.com/600/600/running,shoes?lock=102'),
    ('Kemeja Flanel Casual', 'Kemeja flanel motif kotak, bahan lembut dan adem.', 'Atasan Pria', 'https://loremflickr.com/600/600/flannel,shirt?lock=103'),
    ('Kaos Polos Premium', 'Kaos cotton combed 30s, berbagai warna.', 'Atasan Pria', 'https://loremflickr.com/600/600/tshirt?lock=104'),
    ('Jaket Denim Jeans', 'Jaket denim klasik cocok untuk gaya kasual.', 'Outerwear', 'https://loremflickr.com/600/600/denim,jacket?lock=105'),
    ('Dress Wanita Floral', 'Dress motif bunga, bahan adem cocok untuk harian.', 'Wanita', 'https://loremflickr.com/600/600/dress,floral?lock=106'),
    ('Tas Ransel Urban', 'Tas ransel multifungsi dengan banyak kompartemen.', 'Aksesoris', 'https://loremflickr.com/600/600/backpack?lock=107'),
    ('Jam Tangan Minimalis', 'Jam tangan analog desain minimalis, tahan air.', 'Aksesoris', 'https://loremflickr.com/600/600/wristwatch?lock=108'),
    ('Celana Chino Slimfit', 'Celana chino slim fit, bahan stretch nyaman bergerak.', 'Bawahan Pria', 'https://loremflickr.com/600/600/chinos,pants?lock=109'),
    ('Sandal Slop Kulit', 'Sandal slop kulit asli, cocok untuk santai maupun kerja.', 'Sepatu', 'https://loremflickr.com/600/600/leather,sandals?lock=110'),
    ('Hoodie Oversize', 'Hoodie oversize bahan fleece tebal, hangat dan trendy.', 'Outerwear', 'https://loremflickr.com/600/600/hoodie?lock=111'),
    ('Rok Midi Wanita', 'Rok midi bahan katun, cocok untuk kerja maupun jalan-jalan.', 'Wanita', 'https://loremflickr.com/600/600/skirt,fashion?lock=112');

-- Variants: each product gets 2-3 color/size variants
DO $$
DECLARE
    p RECORD;
    colors TEXT[] := ARRAY['Hitam','Putih','Navy'];
    sizes TEXT[] := ARRAY['S','M','L','XL'];
    base_price NUMERIC;
    v_id INT;
    c TEXT;
    s TEXT;
    sku_counter INT := 1;
BEGIN
    FOR p IN SELECT id, name FROM products LOOP
        base_price := (150000 + (random()*350000)::INT);
        FOREACH c IN ARRAY colors LOOP
            s := sizes[1 + (sku_counter % 4)];
            INSERT INTO product_variants (product_id, sku, color, size, price)
            VALUES (p.id, 'SKU-' || p.id || '-' || sku_counter, c, s, base_price + (sku_counter*5000))
            RETURNING id INTO v_id;

            INSERT INTO stock_buckets (variant_id, available_stock, reserve_stock, order_stock, promo_stock, safety_stock, broken_stock)
            VALUES (v_id, 20 + (random()*30)::INT, 0, 0, 5, 5, 0);

            sku_counter := sku_counter + 1;
        END LOOP;
    END LOOP;
END $$;
