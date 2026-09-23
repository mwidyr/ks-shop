-- =========================================================
-- Item 021/022: Location Tag and Shift Tag for hosts.
--
-- Location Tag: which live-streaming site/studio a host belongs to. Free text,
-- admin-managed, expandable (more locations will be added over time). Required
-- on every host - used later to filter the host list down to one location.
--
-- Shift Tag: Morning / Middle / Evening, optional, editable anytime. Only
-- controls display order of hosts (Morning -> Middle -> Evening -> unassigned
-- last); it does not affect historical LIVE data or KPI calculations.
-- =========================================================

CREATE TABLE host_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Placeholder so existing hosts have somewhere to backfill into; admin can
-- rename/replace it from the new Location Tags manager once real site names
-- are known.
INSERT INTO host_locations (name) VALUES ('Main Studio');

ALTER TABLE hosts ADD COLUMN location_id INT REFERENCES host_locations(id);

UPDATE hosts SET location_id = (SELECT id FROM host_locations WHERE name = 'Main Studio')
WHERE location_id IS NULL;

ALTER TABLE hosts ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX idx_hosts_location ON hosts(location_id);

ALTER TABLE hosts ADD COLUMN shift VARCHAR(10) CHECK (shift IN ('morning', 'middle', 'evening'));
