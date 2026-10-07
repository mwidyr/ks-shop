# Ralulu storefront (ralulu.com)

Customer-facing website, a React + Vite + Tailwind app that talks to the same Go backend as the
admin (`../frontend`, served at admin.ralulu.com) through the public API `/api/public/store/*`
(`backend/internal/handlers/storefront.go`).

## What's in it
Home (hero, category tiles, vouchers, benefits, category tabs, new arrivals, sale), collection
pages (all / search / category / new / sale with filters + sort + paging), product page (gallery,
colour/size, live stock), cart drawer + cart page, voucher codes, guest checkout (7-Eleven /
FamilyMart store code or home address), order confirmation, order tracking (order no. + phone),
promo page, help pages, newsletter sign-up.

Products, categories, vouchers, shipping fees and stock all come from the admin's existing data.
Orders arrive in the admin as `WEB-...` with sales channel "website", status "pending".

## Not built yet
Online payment (waiting on the ECPay logistics/merchant setup), customer accounts/login/rewards,
blog, store locator, banner management (the hero uses the newest products), and the multi-item
promotion types that wait for the promotion rule engine.

## Run locally
```
cd backend && go run ./cmd/api          # API on :8080
cd storefront && npm install && npm run dev   # http://localhost:5174 (proxies /api, /uploads)
```
Point at another API with `VITE_DEV_API=http://host:port npm run dev`.

## Deploy
`docker compose -f docker-compose.prod.yml up -d --build` adds the `store` service on
127.0.0.1:8082. In the host nginx, route `ralulu.com` to `127.0.0.1:8082` and keep
`admin.ralulu.com` on `127.0.0.1:8081` (same TLS setup as docs/DEPLOYMENT_VPS.md).
