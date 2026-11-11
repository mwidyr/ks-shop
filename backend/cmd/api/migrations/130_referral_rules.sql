-- Referral rules v2 (client decision): the invited friend (B) gets a voucher at sign-up (amount, minimum order and
-- validity are admin settings) so it can be used on the very first order; the inviter (A) gets referral_reward only
-- when B's qualifying order is Completed AND A has at least one Completed purchase (otherwise it is held in
-- referral_pending until A's first Completed order). referral_reward_limit caps the rewards one inviter can earn
-- (0 = unlimited). referral_blocked is the staff risk switch for suspected abuse.
ALTER TABLE reward_settings
    ADD COLUMN referral_friend_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN referral_friend_min_order NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN referral_friend_days INT NOT NULL DEFAULT 30,
    ADD COLUMN referral_reward_limit INT NOT NULL DEFAULT 0;
UPDATE reward_settings SET referral_friend_amount = referral_reward;

ALTER TABLE members ADD COLUMN referral_blocked BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE referral_pending (
    referred_id INT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    referrer_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_referral_pending_referrer ON referral_pending(referrer_id);
