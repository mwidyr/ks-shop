# Protecting guest checkout from fake / mass orders

Status: proposal only, nothing implemented yet. All options below are free.

## Why it matters here

Guests can order without an account (`POST /api/public/store/orders`). Today:

- There is no captcha, honeypot or rate limit on order creation, price quote, or the order-tracking lookup (order number + phone, so it can be brute-forced).
- A `pending` order **reserves stock** until it is cancelled. A burst of fake orders can therefore make real products look sold out. This is the main business risk, more than the order count itself.
- There is no payment step (the customer is handed off to WhatsApp), so a fake order costs the attacker nothing.
- Nothing cancels stale pending orders automatically, and the blacklist label is not checked when a guest orders.
- The IP used by the existing limiter is taken from the first `X-Forwarded-For` value, which a client can fake. Any IP-based limit is bypassable until this is fixed.

## Recommended approach (layered, all free)

| # | Measure | Cost | What it stops |
|---|---|---|---|
| 1 | **Cloudflare Turnstile** on the last checkout step, token verified by the backend before the order is created | Free, unlimited. Works without moving DNS to Cloudflare | Bots and scripts |
| 2 | **Rate limits** (reuse the existing in-memory limiter): order create about 5/hour and 20/day per IP and 5/day per phone; order tracking 10/hour per IP; quote 60/min; also login, forgot-password, newsletter | Free | Floods, brute-forcing the tracking lookup |
| 3 | **Fix client IP detection**: host nginx sends `X-Real-IP`, the store container passes it through, the backend reads it instead of the first `X-Forwarded-For` | Free | Header spoofing that defeats #2 |
| 4 | **Honeypot field + minimum fill time** in checkout | Free | Simple bots |
| 5 | **Business rules**: reject blacklisted phones; cap line items and quantity per order; cap open `pending` orders per phone (e.g. 3); validate email format | Free | Repeat offenders, oversized orders |
| 6 | **Auto-cancel stale guest `pending` orders** after a configurable time (e.g. 48h) so reserved stock is released | Free | Stock locking by fake orders |
| 7 | **Record IP and user agent on each order** and show it in order detail (new migration) | Free | Lets CS spot bursts and block offenders |

### Alternatives to Turnstile

- **hCaptcha** free tier: similar, but the free plan is more limited.
- **ALTCHA**: open source, self-hosted proof-of-work, no third party and no tracking. Good if the client does not want Cloudflare. Slightly weaker against determined attackers.
- Google reCAPTCHA is also free, but heavier and worse for privacy. Not recommended.

Suggested default: **Turnstile** (easiest, invisible to most users).

### Deliberately not recommended now

- SMS or WhatsApp OTP on every order: costs money per message and lowers conversion. Keep as a later option, only for orders that look suspicious, if abuse actually appears.
- Paid WAF or bot-management plans: unnecessary at the expected traffic.

## Suggested phases

1. **Phase 1:** items 1 to 5 (backend checks plus the checkout widget). This is the part that blocks most abuse.
2. **Phase 2:** items 6 and 7 (stock release and visibility for CS).
3. **Phase 3, only if needed:** OTP for suspicious orders, bulk cancel in Order Management.

## What we need from the client

- A free Cloudflare account to create a Turnstile site (gives a site key and a secret key).
- Confirmation of the auto-cancel window for unconfirmed guest orders (default proposal: 48 hours) and the per-phone limit on open orders.
- Whether a blacklisted customer should see a neutral "cannot process" message (suggested) or be allowed through to CS.

## Technical notes (for implementation later)

- Order creation: `backend/internal/handlers/storefront.go` (`CreateOrder`, `Track`, `Quote`).
- Limiter and IP: `backend/internal/handlers/site_common.go` (`siteLimiter.allow`, `clientIP`).
- Proxy chain: host nginx, then the `store` container nginx (`storefront/nginx.conf`), then backend. `CF-Connecting-IP` is only relevant if the Cloudflare proxy is later enabled.
- Checkout submit: `storefront/src/pages/Checkout.jsx` (`place()`), `storefront/src/lib/api.js` (`createOrder`).
- Turnstile verification: server-side POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret from an environment variable; skip verification when the variable is unset so development and tests keep working. Cloudflare provides dummy always-pass and always-fail keys for testing.
- Schema: add `client_ip` and a truncated `user_agent` to `orders`. The blacklist already lives in `customer_labels`.
- Auto-cancel can reuse the daily ticker pattern in `backend/cmd/api/main.go` and must write to `order_status_log`.
