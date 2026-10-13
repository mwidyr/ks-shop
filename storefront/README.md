# ralulu storefront (ralulu.com)

Customer-facing website: React 18 + Vite + Tailwind (utility classes) with the **ralulu design** ported 1:1
from the design artboards in [`docs/storefront-design/`](../docs/storefront-design/) (85 `.dc.html` files:
390px mobile for every page, plus desktop for Home / Host / Product). It talks to the same Go backend as the
admin (`../frontend`, admin.ralulu.com) through `/api/public/store/*` (`backend/internal/handlers/storefront.go`,
`site_*.go`) and `/api/theme/published.css`.

## What it is
- **Mobile-first, host- and live-centric commerce**: Home modules (live area, categories, best sellers, new in,
  hosts, style topics), category tree, product pages (gallery + try-on video, colour/size, "Complete the look"),
  cart with two ways to order, 3-step guest checkout, 7-ELEVEN / FamilyMart store search **by number or name**,
  HCT home delivery, coupon sheet, order list / detail / return request, favourites, search (hosts + products +
  articles), host pages (live / offline states, outfits, coupons, replays, journal), live room, style journal,
  CS center, language chooser (id / en / zh).
- **Guest checkout only** (no accounts yet): favourites, "my orders" and claimed coupons live on the device
  (`src/lib/favorites.js`, `localOrders.js`, `claimed.js`); orders can also be found with order no + phone.
- **Pay at store only**. Orders arrive in the admin as `WEB-...`, channel Website, status pending, source
  `self_checkout`. After checkout the order summary is prefilled into a **WhatsApp** link; the number is set in
  Ralulu Hub > Store Profile > Website & WhatsApp (digits with country code, e.g. `6282220056883`).
- **Theme tokens**: no hard-coded colours. `src/styles/tokens.css` holds the defaults (zero-specificity
  `:where(:root)`); the published theme is served by the backend as `/api/theme/published.css`, linked
  (render-blocking) from `index.html`, so there is no colour flash and a failed request never breaks styling.
  Themes, contrast validation, atomic publish and versions are managed in Ralulu Hub > Website > Theme.
- **SEO**: `index.html` contains an nginx SSI include (`/api/public/store/seo?path=$request_uri`) that injects the
  per-page `<title>`, description, canonical, robots (noindex for search/cart/checkout/account/filtered lists),
  Open Graph and JSON-LD (Product, Person, Article, ItemList, BreadcrumbList). The SPA keeps them current
  (`src/lib/seo.js`). Language versions are chosen on the device, so there are no hreflang URL variants.
- **Performance rules**: first screen = search box + hero (`fetchpriority=high`) + live preview; everything else
  `loading="lazy"`; Cloudinary URLs are served as `f_auto,q_auto,w_*` with `srcset`; live is a preview image only
  (never autoplay); disabled home modules are neither sent by the backend nor requested; animations stop under
  `prefers-reduced-motion`.

## Layout of the code
```
src/
  pages/        one file per route (Home, Product, Cart, Checkout, Host, Live, Style, ...)
  components/   Layout (LangBar, headers, footer), BottomNav, CsFab, FreeShipBar, ProductCard, HostCard,
                QuickAdd (size sheet), ui.jsx (Sheet, Field, Stepper, states), Icons
  lib/          api, cart, store (settings + free-shipping rule), quote, wa (WhatsApp links), seo, ...
  i18n/         id.js / en.js / zh.js + parts/*.js (page strings, merged at start-up)
  styles/       tokens.css (default theme)
```

## Run locally
```
cd backend && go run ./cmd/api                  # API on :8080
cd storefront && npm install && npm run dev     # http://localhost:5174 (proxies /api, /uploads)
```
Point at another API with `VITE_DEV_API=http://host:port npm run dev`. Under `vite dev` the SSI include is a
comment and the fallback `<title>` is used; the SPA sets the head itself.

## Deploy
`docker compose -f docker-compose.prod.yml up -d --build` runs the `store` service (nginx + static build) on
127.0.0.1:8082. In the host nginx route `ralulu.com` to it and keep `admin.ralulu.com` on 127.0.0.1:8081; the host
nginx must send `X-Forwarded-Proto https` (the store nginx keeps it for canonical URLs). nginx **SSI must stay on**
(`storefront/nginx.conf`) for the injected head tags.

## Not built yet
Accounts / login (WhatsApp, LINE, OTP) and member balance / points / referral (guest mode keeps a device-local profile instead), online payment (card, LINE Pay, ATM),
hreflang URL variants, prerendering.
