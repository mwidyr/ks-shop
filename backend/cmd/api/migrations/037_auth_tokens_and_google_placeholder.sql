-- Nullable password_hash: an invited-but-not-yet-activated user has none yet, and a future
-- Google-only account never would (see google_id/auth_provider below).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Placeholder for future Google sign-in: schema is ready, no OAuth flow implemented yet.
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'password';

-- One-time tokens for both staff-invite acceptance and password reset - same primitive
-- ("set a password via an emailed link"), differentiated by purpose.
CREATE TABLE auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    purpose VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);
