# Backend — KS Shop API

Go API server for the seller/shop-management tool. No framework beyond a router: raw SQL via
`pgx`, no ORM, one struct per handler holding a `*pgxpool.Pool`. This document explains every
file, the data model, and how a request actually flows end to end — read it alongside the code,
not instead of it.

## Stack

- **Go 1.22**, [chi](https://github.com/go-chi/chi) router + [cors](https://github.com/go-chi/cors) middleware
- **PostgreSQL** via [pgx/v5](https://github.com/jackc/pgx) (`pgxpool`) — no ORM, hand-written SQL
- **Auth**: bcrypt password hashes + JWT (HS256, [golang-jwt/jwt/v5](https://github.com/golang-jwt/jwt))
- Migrations are plain `.sql` files, embedded into the binary with `//go:embed` and run automatically on boot

## Running it standalone

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/ordermgmt?sslmode=disable"
export JWT_SECRET="dev-secret-change-me"
export PORT=8080          # optional, defaults to 8080
go run ./cmd/api
```

On boot it: connects to Postgres, applies any pending migration files (tracked in
`schema_migrations`), creates `./uploads` if missing, then listens on `:$PORT`. See
`internal/config/config.go` for the three env vars it reads (all have dev defaults, so
`go run ./cmd/api` works against a local default-credentials Postgres with zero flags).

## Folder layout

```
backend/
├── cmd/api/
│   ├── main.go            # wiring: router, middleware groups, route table, migration runner
│   └── migrations/        # 001_*.sql ... 017_*.sql, embedded + applied in filename order
├── internal/
│   ├── auth/jwt.go        # JWT claims struct, GenerateToken/ParseToken
│   ├── config/config.go   # env var loading
│   ├── db/db.go           # pgxpool connection + ping
│   ├── middleware/auth.go # JWTAuth (verifies bearer token) + RequireRole (role allow-list)
│   └── handlers/          # one file per resource, see below
└── uploads/                # product-image files land here, served at /uploads/*
```

## Request flow

```
HTTP request
  → chi router (cmd/api/main.go)
  → cors.Handler                                  (allows all origins — internal tool, no cookies)
  → [/api group] appmw.JWTAuth(secret)             (parses "Authorization: Bearer <token>",
                                                     puts *auth.Claims on the request context)
  → appmw.RequireRole(...)                         (403s if claims.Role isn't in the route's allow-list)
  → handler method (e.g. ProductHandler.List)      (reads r.Context() claims if needed, runs SQL,
                                                     writes JSON via respondJSON/respondError)
```

`/api/auth/login` and `GET /uploads/*` are the only two routes outside the JWT-protected `/api`
group. Everything else needs a valid bearer token, and write endpoints for products/hosts/
couriers/fees additionally require `super_user` or `management`.

### Auth (`internal/auth/jwt.go`, `internal/middleware/auth.go`, `internal/handlers/auth.go`)

- `users` table is unified across all roles (staff and — historically — customers; customer
  login was removed in migration `004`, see below). `AuthHandler.Login` joins `users` → `roles`,
  checks `is_active`, verifies the bcrypt hash, then signs a JWT containing `user_id`, `name`,
  `email`, `role`, and `customer_id` (nil for staff).
- `middleware.JWTAuth` rejects requests with no/malformed bearer token or an invalid/expired JWT,
  otherwise stores `*auth.Claims` on the context under `ClaimsKey`.
- `middleware.RequireRole(roles...)` reads those claims and 403s if `claims.Role` isn't allowed.
  Two role groups are wired in `main.go`:
  - `internalRoles = {sales, spv, management, super_user}` — read access to products/orders/
    dashboard/customers/hosts/couriers/fees, plus order creation and status updates.
  - `catalogWriteRoles = {super_user, management}` — write access to products, variants, product
    images, uploads, hosts, couriers, and fee settings.
- Tokens expire after 24h (`auth.GenerateToken`); there's no refresh flow, the frontend just
  re-prompts login.

### Handlers (`internal/handlers/`)

| File | Resource | Notes |
|---|---|---|
| `auth.go` | `POST /auth/login` | Only public route besides `/health` and `/uploads/*`. |
| `products.go` | `/products`, `/products/:id`, `/products/:id/variants`, `/products/:id/variants/:variantId` | Largest handler; see **Products & inventory** below. |
| `product_images.go` | `/products/:id/images` | Add/delete gallery photos (max 5, enforced server-side). |
| `uploads.go` | `POST /uploads/image` | Multipart image upload; sniffs content-type (jpeg/png/webp only), 5MB cap, randomized filename, saves under `./uploads`, returns a `/uploads/...` URL to store as an image record. |
| `orders.go` | `/orders`, `/orders/:id`, `/orders/:id/status` | See **Order lifecycle & stock movements** below. |
| `hosts.go` | `/hosts` | CRUD for live-selling hosts (reference data, no login). Delete is blocked with 409 if the host has order history — deactivate instead. |
| `shipping_couriers.go` | `/shipping-couriers` | Same CRUD/soft-delete pattern as hosts. |
| `customers.go` | `/customers`, `/customers/stats` | `Search`/`Create` are used by order creation (find-or-create buyer); `Stats` powers the CRM page — see **CRM segmentation** below. |
| `dashboard.go` | `/dashboard/summary|graph|host-ranking|top-products|profit|alerts` | All read-only aggregates over `orders`/`order_items`; see **Dashboard aggregates** and **Profit waterfall** below. |
| `settings_fees.go` | `/settings/fees` | Get/update the four fee-assumption numbers in `app_settings` that `dashboard.go`'s `Profit` handler consumes. |
| `respond.go` | — | `respondJSON`/`respondError` — every handler's only way of writing a response. |
| `decode.go` | — | `decodeJSON` — every handler's only way of reading a JSON body. |

Shared helpers worth knowing about because several handlers depend on them:
- `itoa` (bottom of `orders.go`) — used by the dynamic `$N` placeholder builder in `List`.
- `statusLabelFor` (`products.go`) — computes a product's derived status; see below.
- `segmentFor` (`customers.go`) — computes a customer's CRM segment; see below.
- `loadFeeSettings` (`settings_fees.go`) — reads `app_settings` into a `feeSettings` struct;
  called by both the fee-settings handler itself and `dashboard.go`'s `Profit` handler, so both
  always see the same numbers.
- `logAdjustment` (`products.go`) — writes a `stock_movements` audit row whenever a manual
  product-edit changes a stock bucket, but only if the value actually changed (delta ≠ 0).

## Data model

Core tables, roughly in the order they'd matter to a new reader (see `cmd/api/migrations/` for
the literal history — every column below reflects the *current* shape after all 17 migrations):

- **`roles`** / **`users`** — `users.role_id → roles.id`. One `users` table for every internal
  role (`super_user`, `management`, `spv`, `sales`); the `customer` role and `customer_id` FK
  are vestigial from a removed customer-login feature (migration `004`) — `customer_id` is
  always null now, kept only because dropping it isn't worth a migration for an unused column.
- **`customers`** — buyers. No login; just a name/phone/address record created inline during
  order entry (`OrderHandler.Create`) or via `CustomerHandler.Create`.
- **`hosts`** — live-selling hosts (`name`, `platform`, `is_active`). Every order line item is
  attributed to one host; there's no "sales rep" attribution anymore (removed early in the
  ecommerce→seller pivot in favor of hosts being the only attribution axis).
- **`shipping_couriers`** — reference data for the courier dropdown (JNE, J&T, SiCepat,
  AnterAja, Kurir Toko by default), replacing what used to be a hardcoded enum column.
- **`products`** — `name`, `description`, `category` (free text, not a separate table),
  `brand`, `is_active`. No `image_url` column (moved to `product_images` in migration `010`)
  and no stock/status columns — both are computed at query time (see below).
- **`product_images`** — ordered gallery, `sort_order` decides display order, max 5 enforced in
  `ProductHandler.Create`/`ProductImageHandler.AddImage`.
- **`product_variants`** — one row per SKU: `sku`, `color`, `size`, `price`, `compare_at_price`,
  `cost_price` (the latter two added in migration `016` specifically to power Profit Analytics).
- **`stock_buckets`** (1:1 with `product_variants`) — `available_stock`, `reserve_stock`,
  `broken_stock` (all staff-edited directly via `UpdateVariant`), `order_stock` (system-managed,
  see order lifecycle below), `incoming_stock` and `minimum_stock` (added in migration `015`;
  `minimum_stock` is the low-stock alert threshold, `incoming_stock` is informational — nothing
  currently auto-moves it into `available_stock`, it's staff-edited like the others).
  **`total_stock` is never stored** — it's always computed as
  `available_stock + reserve_stock + broken_stock` (order_stock is deliberately excluded: once
  stock is committed to a non-final order it's no longer part of the sellable pool).
- **`stock_movements`** — append-only audit log of every stock change (order creation, status
  transitions, manual edits), each row tagged with an `event_type`, optional `order_id`/
  `user_id`, and a `note`. Nothing reads this back into the UI yet; it exists purely as an audit
  trail.
- **`orders`** — `order_no` (generated, not sequential-looking on purpose:
  `ORD-<unix_ts>-<rand4>`), `customer_id`, `sales_id` (whichever internal user created the
  order — used for the `sales` role's "only see my own orders" filter, distinct from `host_id`
  on line items), `status`, `shipping_address`, `shipping_courier_id`, `discount_amount`,
  `additional_amount` (both added in migration `014`, applied once to the whole order, not
  per line).
- **`order_items`** — `order_id`, `variant_id`, `qty`, `price_at_order` (snapshotted at order
  creation so later price changes don't rewrite history), `host_id`.
- **`order_status_log`** — one row per status transition (`status_from` nullable for the
  initial `pending` row), `changed_by`, optional `reason` (required by the API for
  cancel/return).
- **`app_settings`** — a flat `key → NUMERIC value` table (migration `017`), currently holding
  the four Profit Analytics fee assumptions: `platform_fee_pct`, `payment_fee_pct`,
  `shipping_subsidy_flat`, `ad_cost_flat`.
- **`schema_migrations`** — created by the runner itself (not a migration file), tracks which
  filenames have been applied.

Removed along the way (see migration `004`): `carts`, `cart_items`, `orders.cart_id` — this app
has no customer-facing storefront/checkout; every order is entered directly by staff.

## Order lifecycle & stock movements (`orders.go`)

Status flow, enforced by `validTransitions` — any transition not in this table is rejected with
400:

```
pending → confirm → packing → picking → shipped → delivered → return
   ↓          ↓          ↓          ↓          ↓
cancelled  cancelled  cancelled  cancelled  cancelled
```

`cancelled` and `return` both require a non-empty `reason` in the request body.

**`Create`** (`POST /orders`) runs entirely inside one transaction:
1. Resolve the buyer — either use `customer.id` if given, or insert a new `customers` row.
2. Insert the `orders` row as `pending`, and immediately log the initial `order_status_log` row
   (`status_from = NULL → pending`).
3. For each line item: `SELECT ... FOR UPDATE` the variant's `stock_buckets` row (locks it
   against concurrent orders), reject with 409 if `available_stock < qty`, otherwise move the
   quantity `available_stock → order_stock`, insert an `order_items` row with the variant's
   *current* price snapshotted, and log a `stock_movements` row (`event_type =
   order_created`).
4. Commit. Any failure anywhere rolls the whole thing back (`defer tx.Rollback`), so a
   mid-transaction stock conflict never leaves a partial order behind.

**`UpdateStatus`** (`PATCH /orders/:id/status`) also runs in a transaction, and moves stock
depending on the *target* status:
- **`delivered`**: `order_stock -= qty` (sale finalized — the stock already left `available_stock`
  back at creation time, so `total_stock` is unaffected here).
- **`cancelled`**: `order_stock -= qty`, `available_stock += qty` (stock returns to the sellable
  pool).
- **`return`**: `broken_stock += qty`, and `order_stock -= qty` *unless* the order was already
  `delivered` (in which case `order_stock` is already 0, so only `broken_stock` moves — the
  physical item is what's coming back, not a pending order).

Every branch above also writes a `stock_movements` row, then the order's `status` is updated and
a new `order_status_log` row is appended — in that order, all inside the same transaction as the
status check, so a concurrent status change on the same order serializes on the `FOR UPDATE`
row lock rather than racing.

**`List`** builds its `WHERE` clause dynamically (`baseWhere` + a closure `addArg` that appends
to `args` and returns the next `$N` placeholder) to support any combination of `status`,
`date_from`/`date_to`, `courier_id`, `host_id` (via an `EXISTS` against `order_items`),
`category` (via an `EXISTS` joining `order_items → product_variants → products`), and `q` (an
`ILIKE` against customer name/phone). Role-based scoping (`sales` sees only their own orders) is
injected as just another `AND` clause using the same mechanism. Per-order total and quantity are
computed with `SUM(oi.qty * oi.price_at_order) - discount_amount + additional_amount`.

## Products & inventory (`products.go`)

- **`List`** runs four separate queries (products, images, variants+stock, units-sold) rather
  than one giant join, to avoid the row-multiplication a naive `products JOIN images JOIN
  variants` would cause, then stitches them together in Go via an `idIndex map[int]int`
  (product ID → its position in the `products` slice). Units sold is a `SUM(oi.qty)` over
  non-cancelled orders, grouped by product.
- **Computed, never stored**: `Variant.TotalStock` (`available + reserve + broken`) and
  `Product.StatusLabel`, via `statusLabelFor(isActive, available, minimum)`:
  - `available == 0` → `out_of_stock` (checked first — wins even if the product is active)
  - `minimum > 0 && available <= minimum` → `low_stock`
  - else `active` or `nonaktif` from `is_active`

  This mirrors the existing pattern of never persisting a field the DB can already derive.
- **`Create`** inserts the product row, up to 5 `product_images` rows, then loops
  `insertVariant` for each submitted variant (each variant gets its own `stock_buckets` row in
  the same call — `insertVariantReturningID`).
- **`Update`** only ever touches the `products` table itself (name/description/category/brand/
  is_active) — variants, images, and stock all have their own endpoints, by design (matches the
  product requirement that total_stock can never be set directly by a client).
- **`UpdateVariant`** is the only place stock buckets are staff-edited directly. It reads the
  *before* values under `FOR UPDATE`, applies the new values, then calls `logAdjustment` once
  per bucket (available/broken/reserve/incoming) so the `stock_movements` audit trail captures
  manual edits distinctly from order-driven ones (`event_type = stock_adjustment`, `note`
  records direction "increase via product edit" / "decrease via product edit"). `order_stock`
  and `minimum_stock`'s effect on `total_stock` are never part of this — `minimum_stock` is
  purely an alert threshold, not a stock bucket.
- **`Delete`** relies on the FK constraint from `order_items.variant_id` (no cascade) to refuse
  deleting a product that's ever been ordered — caught via a string match on the Postgres error
  and turned into a 409 asking the caller to deactivate instead.

## Dashboard aggregates (`dashboard.go`)

All five read endpoints share `dateRange(r)`, which parses `?from=YYYY-MM-DD&to=YYYY-MM-DD` into
a half-open `[from, to)` window (`to` gets +24h so the end date is inclusive); if neither param
is given, `filtered` comes back `false` and each handler individually decides its own default
(`Summary` means "all time"; `Graph`/`HostRanking`/`TopProducts`/`Profit`/`Alerts` default to the
trailing 30 days).

- **`Summary`** — order counts and revenue grouped by status. The revenue query is written with
  a `LATERAL` join computing each order's total once (`SUM(item prices) - discount + additional`)
  before it's grouped by status — a plain `SUM` over a `LEFT JOIN orders → order_items` would
  otherwise double-count `discount_amount`/`additional_amount` once per line item, since those
  columns live on the order, not the item.
- **`Graph`** / **`HostRanking`** / **`TopProducts`** — straightforward `GROUP BY` aggregates
  over `order_items JOIN orders JOIN hosts/products`, all excluding `cancelled`/`return` orders
  from "sold" metrics.
- **`Profit`** — see below.
- **`Alerts`** — four independent numbers for the dashboard's alert panel: `low_stock_count`
  (`stock_buckets` where `available_stock <= minimum_stock` and `minimum_stock > 0`, **not**
  date-scoped — it's a current-state count), `ship_today_count` (orders currently in
  `confirm`/`packing`/`picking`, also current-state), `completed_count` (delivered orders inside
  the range), and `declining_products` — a real comparison: for each product, sum quantity sold
  in the selected range vs. an equal-length *prior* period immediately before it
  (`priorFrom := from - (to - from)`), and list any product where `current_qty < prior_qty`.

### Profit waterfall

`Profit` (`GET /dashboard/profit?from=&to=`) is the one place the app computes real margin, and
it's explicit about what's real vs. assumed:

```
gross_sales   = SUM(qty * price_at_order)                  -- real, excludes cancelled orders
- discount    = SUM(orders.discount_amount)                -- real
+ additional  = SUM(orders.additional_amount)               -- real
= net_sales
- platform_fee    = gross_sales * platform_fee_pct / 100    -- assumption, from app_settings
- payment_fee     = gross_sales * payment_fee_pct / 100     -- assumption, from app_settings
- shipping_subsidy = shipping_subsidy_flat * order_count    -- assumption, from app_settings
- ad_cost         = ad_cost_flat * order_count               -- assumption, from app_settings
- refund      = SUM(qty * price_at_order) WHERE status='return'  -- real
- cogs        = SUM(qty * variant.cost_price)                -- real (needs cost_price set per variant)
= net_profit
margin_pct    = net_profit / gross_sales * 100
```

There's no real payment gateway or ad-spend integration, so the four fee lines are seller-
configured percentages/flats (`Settings → Asumsi Biaya`, backed by `settings_fees.go` +
`app_settings`) rather than fetched from anywhere live — everything else in the waterfall is a
genuine aggregate over `orders`/`order_items`/`product_variants`.

## CRM segmentation (`customers.go`)

`Stats` (`GET /customers/stats`) computes, per customer, `order_count`, `total_spend`, and
`last_order_at` via a `LEFT JOIN LATERAL` (so customers with zero orders still appear, with
zeros) wrapping the same per-order-total `LATERAL` pattern used in `dashboard.go`'s `Summary`.
`segmentFor` then buckets each customer purely from those three numbers, checked in this order:

1. `order_count == 0` → `inactive`
2. `last_order_at` more than 90 days ago → `inactive` (even with a big historical spend)
3. `total_spend >= 10,000,000` or `order_count >= 20` → `vip`
4. `total_spend >= 3,000,000` → `high_value`
5. `order_count >= 2` → `returning`
6. otherwise → `new`

Like `status_label` on products, this is computed on every request rather than stored — there's
no `customers.segment` column, so the thresholds can be tuned without a migration or backfill.

## Migration history at a glance

The 17 files in `cmd/api/migrations/` tell the app's evolution better than prose:
`001_init`/`002_seed` — original generic ecommerce schema (customers/products/carts/orders) with
sample fashion products. `003`–`010` — the ecommerce→seller pivot: drop cart/checkout entirely,
introduce `hosts` and `shipping_couriers` as managed reference data, move order attribution from
an internal sales user to a host, simplify stock buckets, add product active/inactive + a real
multi-photo gallery. `011`–`013` — sample order seeding, then a host rename pass and a rebalanced
reseed so dashboard charts have data across all order-outcome buckets (not just delivered).
`014` — per-order discount/additional pricing. `015`–`017` — the most recent expansion:
incoming/minimum stock, brand + cost/compare-at price on variants, and the `app_settings` table
backing configurable profit-fee assumptions. Migrations are additive-only (no down-migrations) —
the runner in `main.go` just applies whatever's new by filename order and records it.
