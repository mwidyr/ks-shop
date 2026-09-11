-- =========================================================
-- Activity Log: a generic table for "important changes" that don't
-- already have their own history table (order status changes already
-- live in order_status_log, stock changes in stock_movements - the
-- Activity Log endpoint reads all three via UNION rather than
-- duplicating those writes here).
-- =========================================================

CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL,
    entity_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    changed_by INT REFERENCES users(id),
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);
