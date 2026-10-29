-- Adjust 157: Personal Best used to look only at live_sessions rows with status 'live' (Panel Siaran), which the
-- real LIVE flow (schedule + manual Start LIVE) never creates, so it never fired. A LIVE is now a host's scheduled
-- shift window or manual session, so the once-per-LIVE guard is keyed on the window start instead of a session id.
ALTER TABLE telegram_notification_log ADD COLUMN window_start TIMESTAMPTZ;
CREATE UNIQUE INDEX uq_telegram_log_personal_best_window ON telegram_notification_log (scope, window_start)
    WHERE notification_type = 'personal_best' AND window_start IS NOT NULL;
