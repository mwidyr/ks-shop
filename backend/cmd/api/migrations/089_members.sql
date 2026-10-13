-- Customer accounts for the website (login by WhatsApp number or email OTP) + wallet (balance / points),
-- referral, member-bound coupons. Separate from staff `users` on purpose (no roles / permissions mixing).
CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,                 -- canonical digits with country code, e.g. 886912345678
    email VARCHAR(150) UNIQUE,
    name VARCHAR(150) NOT NULL DEFAULT '',
    birthday DATE,
    language VARCHAR(5) NOT NULL DEFAULT 'id',
    referral_code VARCHAR(12) NOT NULL UNIQUE,
    referred_by INT REFERENCES members(id),
    customer_id INT REFERENCES customers(id), -- same person in the orders / CRM data (matched by verified phone)
    profile JSONB NOT NULL DEFAULT '{}',      -- height, weight, addresses, stores
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- One row per code challenge. channel 'email': the code is mailed. channel 'wa': the member sends the code from
-- their own WhatsApp to the shop number; the inbound webhook marks it verified when text + sender match.
CREATE TABLE member_otps (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(5) NOT NULL CHECK (channel IN ('email', 'wa')),
    target VARCHAR(150) NOT NULL,             -- email, or canonical phone
    code_hash VARCHAR(64) NOT NULL,
    referral_code VARCHAR(12),
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    wa_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_otps_target ON member_otps(channel, target, created_at DESC);
CREATE INDEX idx_member_otps_hash ON member_otps(code_hash) WHERE used_at IS NULL;

CREATE TABLE member_favorites (
    member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price_at_save NUMERIC(14,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (member_id, product_id)
);

CREATE TABLE member_coupons (
    member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    promotion_id INT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (member_id, promotion_id)
);

-- Wallet: balance in NT$, points in points. Balances are SUM(amount). reason_key makes grants idempotent
-- (welcome, referral, per-order earn / refund).
CREATE TABLE member_ledger (
    id SERIAL PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind VARCHAR(8) NOT NULL CHECK (kind IN ('balance', 'points')),
    amount NUMERIC(14,2) NOT NULL,
    reason VARCHAR(40) NOT NULL,
    reason_key VARCHAR(60),
    note TEXT,
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_member_ledger_key ON member_ledger(member_id, kind, reason_key) WHERE reason_key IS NOT NULL;
CREATE INDEX idx_member_ledger_member ON member_ledger(member_id, created_at DESC);

CREATE TABLE reward_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    welcome_balance NUMERIC(14,2) NOT NULL DEFAULT 100,
    welcome_voucher_amount NUMERIC(14,2) NOT NULL DEFAULT 150,
    welcome_voucher_min_order NUMERIC(14,2) NOT NULL DEFAULT 1500,
    welcome_voucher_days INT NOT NULL DEFAULT 30,
    referral_reward NUMERIC(14,2) NOT NULL DEFAULT 50,
    points_per_100 NUMERIC(8,2) NOT NULL DEFAULT 1,
    point_value NUMERIC(8,2) NOT NULL DEFAULT 1,
    birthday_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
    refund_credit_bonus_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO reward_settings (id) VALUES (1);

ALTER TABLE orders ADD COLUMN member_id INT REFERENCES members(id);
ALTER TABLE orders ADD COLUMN wallet_balance_used NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN wallet_points_used INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN wallet_points_value NUMERIC(14,2) NOT NULL DEFAULT 0;
CREATE INDEX idx_orders_member ON orders(member_id) WHERE member_id IS NOT NULL;

ALTER TABLE promotions ADD COLUMN member_id INT REFERENCES members(id) ON DELETE CASCADE; -- member-bound (welcome, birthday)

ALTER TABLE web_return_requests ADD COLUMN credited_at TIMESTAMPTZ;

INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'members', access_level FROM role_tab_access WHERE tab_key = 'store_profile'
ON CONFLICT (role_name, tab_key) DO NOTHING;
