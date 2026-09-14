-- Replaces name-string-matching (fragile: breaks if staff renames a chain in Settings) with a
-- real classification column, used by shipping fee calc, order creation, and CVS/courier export.
ALTER TABLE pickup_chains ADD COLUMN chain_type VARCHAR(20) NOT NULL DEFAULT 'other';
UPDATE pickup_chains SET chain_type = 'cvs_711' WHERE name = '7-Eleven';
UPDATE pickup_chains SET chain_type = 'cvs_familymart' WHERE name = 'FamilyMart';
UPDATE pickup_chains SET chain_type = 'courier' WHERE name IN ('Alamat Customer', 'Lainnya');
