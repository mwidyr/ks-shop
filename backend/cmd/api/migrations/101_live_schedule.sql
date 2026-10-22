-- Website LIVE status now follows a schedule instead of being typed per host:
--   shift hours (Taiwan time)  x  the host's location working days  ->  "LIVE now" / "next LIVE".
-- "End LIVE" only suppresses the window it was pressed in, so the next window starts by itself.
-- The old hand-typed columns on hosts (live_status, next_live_at, viewer_count, ...) are left in place, unused.

-- default hours per shift: a list of [start, end] ranges (HH:MM, Taiwan time); an end <= start crosses midnight.
CREATE TABLE live_shift_hours (
    shift VARCHAR(10) PRIMARY KEY CHECK (shift IN ('morning', 'middle', 'evening')),
    ranges JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO live_shift_hours (shift, ranges) VALUES
    ('morning', '[["07:00","10:00"],["13:00","16:00"]]'),
    ('middle',  '[["10:00","13:00"],["16:00","19:00"]]'),
    ('evening', '[]');

-- working weekdays per location (0 = Sunday ... 6 = Saturday); default Sunday-Friday, Saturday off.
ALTER TABLE host_locations ADD COLUMN work_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5}';

-- extra days off for one location (a public holiday, a studio closure)
CREATE TABLE location_days_off (
    location_id INT NOT NULL REFERENCES host_locations(id) ON DELETE CASCADE,
    off_date DATE NOT NULL,
    note VARCHAR(120) NOT NULL DEFAULT '',
    PRIMARY KEY (location_id, off_date)
);

-- a manual "End LIVE": the window that started at window_start no longer shows the host as LIVE
CREATE TABLE host_live_ends (
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (host_id, window_start)
);

-- admin tab for the new Global LIVE Settings page (same access as the Website Hosts tab at first)
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'website_live', access_level FROM role_tab_access WHERE tab_key = 'website_hosts'
ON CONFLICT (role_name, tab_key) DO NOTHING;
