-- =========================================================
-- Performance Dashboard needs RET/RET$ attributed per host (see spec's
-- Performance Data columns). Resolved at return-creation time from the
-- order's order_items - one dominant host per order in this live-selling
-- model, same assumption order_items.host_id already makes elsewhere.
-- =========================================================

ALTER TABLE returns ADD COLUMN host_id INT REFERENCES hosts(id);
CREATE INDEX idx_returns_host ON returns(host_id);
