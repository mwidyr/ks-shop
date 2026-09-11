-- =========================================================
-- Role & Permission framework: storage + a Settings UI to edit the
-- matrix. The exact matrix is meeting-dependent (client wants Admin/CS/
-- Warehouse eventually) - this seeds a reasonable starter catalog derived
-- from existing route groups, NOT a final matrix. Enforcement of the
-- existing ~30 appmw.RequireRole(...) call sites is NOT changed in this
-- pass; this is storage + UI only, see role_permissions.go.
-- =========================================================

CREATE TABLE permissions (
    key VARCHAR(80) PRIMARY KEY,
    description TEXT NOT NULL,
    group_name VARCHAR(40) NOT NULL
);

CREATE TABLE role_permissions (
    role_name VARCHAR(30) NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
    permission_key VARCHAR(80) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (role_name, permission_key)
);

INSERT INTO permissions (key, description, group_name) VALUES
    ('orders.view', 'Lihat pesanan', 'Pesanan'),
    ('orders.edit_status', 'Ubah status pesanan', 'Pesanan'),
    ('orders.merge', 'Gabungkan pesanan', 'Pesanan'),
    ('products.view', 'Lihat produk', 'Produk'),
    ('products.write', 'Tambah/edit produk', 'Produk'),
    ('inventory.write', 'Sesuaikan stok', 'Produk'),
    ('customers.view', 'Lihat pelanggan', 'Pelanggan'),
    ('customers.write', 'Ubah label pelanggan', 'Pelanggan'),
    ('shipping.export', 'Ekspor data pengiriman', 'Pengiriman'),
    ('settings.shipping.edit', 'Ubah pengaturan ongkir', 'Pengaturan'),
    ('settings.fees.edit', 'Ubah asumsi biaya', 'Pengaturan'),
    ('users.manage', 'Kelola staf & role', 'Sistem');

-- Starter defaults: super_user gets everything, other seeded roles get view-only.
INSERT INTO role_permissions (role_name, permission_key)
    SELECT 'super_user', key FROM permissions;
INSERT INTO role_permissions (role_name, permission_key)
    SELECT r.name, p.key FROM roles r, permissions p
    WHERE r.name != 'super_user' AND p.key LIKE '%.view';
