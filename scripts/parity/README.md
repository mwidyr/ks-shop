# Storefront ↔ artboard parity

`node run.mjs [Id …] [--verbose] [--geo]` renders every artboard in `docs/storefront-design/` and the matching storefront route
(same viewport, `/api/**` mocked from `fixtures.mjs`, every `<img>` replaced by one flat grey, animations off, date frozen)
and reports pixel diff + text equality (`out/report.md`, `out/<Id>.png` = reference | app | diff).

Manifest options: `max` (pixel budget %), `cmpH` (compare only the top N px), `regions` (compare slices), `deviate` (texts that
intentionally differ), `actions` (clicks to reach a state), `session`/`local` (storage), `api` (fixture overrides).

Install once: `npm i` here, Chrome installed; set `STORE_URL` (default http://localhost:5190) and `CHROME` if needed.
`node keys_audit.mjs` (run inside `storefront/src`) lists i18n keys missing in id/en/zh.

## Status
Matched (≤ budget, identical text): Main, Language, Menu, Login*, Service, Member, Orders*, Wishlist, Member_Coupons*, Profile*, OrderDetail*, Return,
Search*, Category, ProductList*, Cart, ZH_* (Info … Success, 15), Journal, Topic, Article* (top part), Live, Hosts*, HostBrand (top 1500px), Product_v2 (top part),
WA_Handoff*, Coupon_Apply* (* = documented deviations in manifest.mjs: pay-at-store, no LINE, no data for ETA / replay length, placeholder logos).

HostArticle also matches (0.2%).

Not matched: Desktop_Home / Desktop_Host / Desktop_Product (the desktop artboards drop the text navigation from the header and use another grid;
needs a product decision before changing the desktop shell), Product_Video, Host_States / Hosts_States (state matrices), DL_* pieces.
Host_Live / Host_Offline are older status-based host layouts, superseded by HostBrand (which already has the live block).
Legacy variants superseded by ZH_* / HostBrand / Product_v2: Checkout, OrderSuccess, Product.
