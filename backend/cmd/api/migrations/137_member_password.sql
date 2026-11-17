-- Website members can sign in with email + password (set at registration, changeable in the profile).
-- The mailed code stays: it proves the email when registering, and it is the "forgot password" way in.
ALTER TABLE members
    ADD COLUMN password_hash       TEXT,
    ADD COLUMN password_changed_at TIMESTAMPTZ,
    ADD COLUMN login_failures      INT NOT NULL DEFAULT 0,
    ADD COLUMN locked_until        TIMESTAMPTZ;
