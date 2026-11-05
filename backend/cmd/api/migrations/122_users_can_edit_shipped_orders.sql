-- Per-user permission: may edit (customer / delivery data, notes) and re-export an order after it was exported
-- or shipped, and merge / unmerge such orders. Set from User Management (Admin only). Super admin always may.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_shipped_orders BOOLEAN NOT NULL DEFAULT false;
-- Warehouse staff get it by default (the client asked for Superuser + Warehouse); it can be switched off per user.
UPDATE users SET can_edit_shipped_orders = true
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('super_user', 'warehouse'));
