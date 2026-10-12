-- Replenishment Planning alert thresholds (global, single row) and the new Product Trend
-- Analysis tab. Procurement Overdue has no threshold: it is derived from PO expected arrival dates.
CREATE TABLE replenishment_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    stockout_days INT NOT NULL DEFAULT 7 CHECK (stockout_days >= 1),
    restock_days INT NOT NULL DEFAULT 28 CHECK (restock_days >= 1),
    stagnant_days INT NOT NULL DEFAULT 14 CHECK (stagnant_days >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (restock_days > stockout_days)
);
INSERT INTO replenishment_settings (id) VALUES (1);

-- product_trend starts with the same access as its sibling product_analytics.
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'product_trend', access_level FROM role_tab_access WHERE tab_key = 'product_analytics'
ON CONFLICT (role_name, tab_key) DO NOTHING;
