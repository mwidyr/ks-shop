-- =========================================================
-- Small key/value settings table for configurable assumptions,
-- starting with the fee percentages Profit Analytics needs
-- (no real payment gateway/ads integration exists, so these
-- are manually-set assumptions rather than fetched live).
-- =========================================================

CREATE TABLE app_settings (
    key VARCHAR(60) PRIMARY KEY,
    value NUMERIC(14,4) NOT NULL
);

INSERT INTO app_settings (key, value) VALUES
    ('platform_fee_pct', 2),
    ('payment_fee_pct', 1.5),
    ('shipping_subsidy_flat', 0),
    ('ad_cost_flat', 0);
