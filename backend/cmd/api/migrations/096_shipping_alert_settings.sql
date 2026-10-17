-- Shipping Workbench: how long an order may sit in Processing / Ready to Ship before the
-- homepage warns about it (hours). Only a reminder - nothing changes automatically.
INSERT INTO app_settings (key, value) VALUES
    ('ship_alert_processing_hours', 24),
    ('ship_alert_ready_hours', 48)
ON CONFLICT (key) DO NOTHING;
