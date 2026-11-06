-- TikTok Account Management + CEK VIEWS (moved from Google Sheets / Apps Script).
--   Rooms / devices hang under the existing Locations (host_locations); every Location gets ROOM001-ROOM005.
--   A TikTok account may stay unassigned: device, room and location are independent optional fields.
--   CEK VIEWS assigns one TikTok account to each Host (hosts keep their Location and Shift from Host Management).

CREATE TABLE tiktok_rooms (
    id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES host_locations(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,
    UNIQUE (location_id, name)
);

CREATE TABLE tiktok_devices (
    id SERIAL PRIMARY KEY,
    room_id INT NOT NULL REFERENCES tiktok_rooms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tiktok_devices_room ON tiktok_devices(room_id);

CREATE TABLE tiktok_accounts (
    id SERIAL PRIMARY KEY,
    tiktok_id VARCHAR(100) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'BACKUP' CHECK (status IN ('LIVE','BACKUP','BLOCKED','OHCA')),
    device_id INT REFERENCES tiktok_devices(id) ON DELETE SET NULL,
    room_id INT REFERENCES tiktok_rooms(id) ON DELETE SET NULL,
    location_id INT REFERENCES host_locations(id) ON DELETE SET NULL,
    password TEXT NOT NULL DEFAULT '',
    twofa TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    email_password TEXT NOT NULL DEFAULT '',
    account_level INT NOT NULL DEFAULT 0,
    account_created_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_tiktok_accounts_id ON tiktok_accounts (lower(tiktok_id));
CREATE INDEX idx_tiktok_accounts_status ON tiktok_accounts(status);

CREATE TABLE tiktok_account_notes (
    id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES tiktok_accounts(id) ON DELETE CASCADE,
    user_id INT,
    author VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tiktok_notes_account ON tiktok_account_notes(account_id, created_at);

-- Live Assignment: which TikTok account each Host reports views for (OFF = temporarily left out of CEK VIEWS).
CREATE TABLE cek_views_assignments (
    host_id INT PRIMARY KEY REFERENCES hosts(id) ON DELETE CASCADE,
    tiktok_account_id INT REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
    is_off BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every submission, one row per host. The "increase" in the report is the difference to the latest earlier row of the same host.
CREATE TABLE cek_views_log (
    id BIGSERIAL PRIMARY KEY,
    host_id INT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    host_name VARCHAR(150) NOT NULL,
    location_id INT,
    location_name VARCHAR(150) NOT NULL DEFAULT '',
    shift VARCHAR(10) NOT NULL DEFAULT '',
    tiktok_id VARCHAR(100) NOT NULL,
    room VARCHAR(30) NOT NULL DEFAULT '',
    device VARCHAR(100) NOT NULL DEFAULT '',
    views INT NOT NULL CHECK (views >= 0),
    submitted_by INT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cek_views_log_host ON cek_views_log(host_id, submitted_at DESC);

-- Voice reminder: one recording, one shared time schedule (days + times in settings JSON, Asia/Jakarta),
-- and a ledger so a reminder time is never sent twice.
CREATE TABLE cek_views_voice_file (
    id INT PRIMARY KEY CHECK (id = 1),
    filename VARCHAR(200) NOT NULL,
    mime VARCHAR(100) NOT NULL DEFAULT 'audio/ogg',
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE cek_views_voice_sent (
    sent_on DATE NOT NULL,
    at_time CHAR(5) NOT NULL,
    PRIMARY KEY (sent_on, at_time)
);
