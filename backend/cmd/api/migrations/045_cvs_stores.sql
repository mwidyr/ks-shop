-- Local cache of ECPay's CVS (7-Eleven/FamilyMart) store list, refreshed lazily (see
-- CvsStoreHandler) whenever it's stale, so a typed store code can be validated instantly
-- against real data without an external API round-trip on every keystroke.
CREATE TABLE cvs_stores (
    chain_type VARCHAR(20) NOT NULL,
    store_code VARCHAR(10) NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    store_addr VARCHAR(200) NOT NULL DEFAULT '',
    store_phone VARCHAR(30) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_type, store_code)
);
