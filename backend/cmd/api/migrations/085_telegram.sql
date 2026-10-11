-- Telegram Bot integration: each Location gets its own Telegram group (chat id), and every
-- notification that was sent is logged so a milestone is never announced twice (the unique
-- indexes are the duplicate prevention: once per host / Location per business day per
-- milestone, and once per LIVE session for Personal Best).
ALTER TABLE host_locations ADD COLUMN telegram_chat_id VARCHAR(64);

CREATE TABLE telegram_notification_log (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(30) NOT NULL,   -- host_milestone | personal_best | location_milestone | global_host_milestone
    scope VARCHAR(30) NOT NULL,               -- host id or Location id
    business_date DATE NOT NULL,              -- Asia/Jakarta day
    milestone INT NOT NULL,                   -- milestone PCS (Personal Best: the new record)
    live_session_id INT REFERENCES live_sessions(id) ON DELETE SET NULL,
    qty INT NOT NULL DEFAULT 0,
    previous_best INT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_telegram_log_milestone ON telegram_notification_log (notification_type, scope, business_date, milestone)
    WHERE notification_type <> 'personal_best';
CREATE UNIQUE INDEX uq_telegram_log_personal_best ON telegram_notification_log (scope, live_session_id)
    WHERE notification_type = 'personal_best';
