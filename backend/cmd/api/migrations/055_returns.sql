-- =========================================================
-- Item #007 prerequisite: real Returns/Refunds tracking, replacing the
-- hardcoded mock data in Returns.jsx and Refunds.jsx. A return is a request
-- against an existing order - reason, requested refund type/amount/qty -
-- that moves through an approval pipeline (stage 1-6, matching the UI's
-- existing Submitted -> Reviewed -> Approved -> Item Received -> Inspection
-- -> Refund labels) until it's approved through to completion or rejected.
--
-- This is deliberately separate from the existing orders.status='return'
-- transition (see 001_init.sql's order_items/stock_movements logic): that
-- one flips a whole order to "returned" and restocks it immediately. A
-- return request here can be partial (a subset of an order's qty/amount)
-- and doesn't touch stock on its own - if/when staff decide the whole
-- order should be marked returned and restocked, they still do that from
-- Order Detail as today. The two are related but intentionally decoupled.
-- =========================================================

CREATE TABLE returns (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    reason VARCHAR(30) NOT NULL,       -- damaged, wrong_item, missing_item, defective, change_of_mind
    refund_type VARCHAR(20) NOT NULL DEFAULT 'full', -- full, replacement, store_credit
    stage INT NOT NULL DEFAULT 1,      -- 1 submitted .. 6 refund
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, rejected, completed
    qty INT NOT NULL DEFAULT 0,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status);
