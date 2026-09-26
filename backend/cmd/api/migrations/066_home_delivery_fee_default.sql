-- Default home-delivery flat fee to NT$100 (Adjustment tracker item 027).
-- app_settings.home_delivery_flat_fee was reset to 0 in migration 027_reseed_pickup_chains_taiwan.sql
-- and never re-seeded since; staff have already set 7-Eleven/FamilyMart's target_fee to 60 live via
-- the Shipping Settings UI, but the home-delivery default was left unset. Still fully editable via
-- that same UI afterward - this just guarantees the correct default on this VPS.
UPDATE app_settings SET value = 100 WHERE key = 'home_delivery_flat_fee';
