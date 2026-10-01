-- Item 003: Live Panel's old "Broadcast Console" card (LiveSessionDetail.jsx) just showed
-- "{{count}} products ready to display live" - no real function. Replaces it with a feature for
-- hosts to upload TikTok LIVE screenshots. This round ships storage only: recognized_data/status
-- stay unused placeholders (visible "AI recognition coming soon" badge on the frontend) until a
-- vision provider is picked in a follow-up round.
CREATE TABLE live_session_screenshots (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    uploaded_by INT REFERENCES users(id),
    recognized_data JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_review', -- pending_review, processed (unused this round)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_session_screenshots_session ON live_session_screenshots(session_id);
