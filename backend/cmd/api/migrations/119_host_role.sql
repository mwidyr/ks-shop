-- Host accounts: a role 'host' whose user is tied to one row of hosts. The server limits a Host account to
-- its own performance data (see internal/middleware/hostscope.go); its access to the analytics tabs is
-- fixed here and is not part of the editable permission matrix.
INSERT INTO roles (name) VALUES ('host') ON CONFLICT (name) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS host_id INT REFERENCES hosts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_host_id ON users(host_id) WHERE host_id IS NOT NULL;

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT 'host', tab, 'view' FROM unnest(ARRAY[
    'host_performance_analytics', 'product_analytics', 'product_trend', 'product_performance', 'product_color_pair'
]) AS tab
ON CONFLICT (role_name, tab_key) DO NOTHING;
