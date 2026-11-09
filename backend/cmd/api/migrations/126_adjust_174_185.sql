-- Attendance statuses become fully manageable (add / edit / delete, no mandatory status):
--   kind = how Payroll counts a day with this status (Work / Off / Leave days; 'other' is only counted as paid / unpaid),
--   which replaces the old reliance on the codes W / OFF / LV. Deleting a status removes its attendance records, so
--   those dates fall back to the default status.
ALTER TABLE attendance_statuses ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'other' CHECK (kind IN ('work','off','leave','other'));
UPDATE attendance_statuses SET kind = CASE code WHEN 'W' THEN 'work' WHEN 'OFF' THEN 'off' WHEN 'LV' THEN 'leave' ELSE 'other' END;
ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_status_id_fkey;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_id_fkey FOREIGN KEY (status_id) REFERENCES attendance_statuses(id) ON DELETE CASCADE;

-- Location Tags (Host Management) get a manual order; it was alphabetical. Existing tags keep today's order.
ALTER TABLE host_locations ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
UPDATE host_locations l SET sort_order = r.n FROM (SELECT id, row_number() OVER (ORDER BY name) AS n FROM host_locations) r WHERE r.id = l.id;

-- MBTI is a free-text field now (ENTJ-A, ENTJ-T ...), not one of 16 fixed types.
ALTER TABLE employees ALTER COLUMN mbti TYPE VARCHAR(10);
