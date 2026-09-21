# Module 11: Supplier & Purchasing Integration

Implementation guide for everything in `Supplier-Purchasing-Integration-Scope.pdf` and
`Decisions Needed.pdf`. Each section: **Current Code** (what exists today, with file:line),
**Changes Needed** (concrete migration/backend/frontend work), **How to Test** (steps to verify
after the change ships). Client decisions from `Decisions Needed.pdf` are folded directly into
"Changes Needed" so this doc reflects the *decided* design, not the open questions.

Suggested build order (dependencies noted per section): **1 → 2 → 3 → 4 → 5 → 7 → 6 → 8**,
i.e. Product Code first, then Supplier Management (independent), then Purchasing + its
inventory wiring together (they're one flow), then the derived views (Product↔Supplier,
Supplier Performance) last since they read off real purchase/sales data.

---

## 0. Data Prerequisites (confirmed, ready to use)

Verified directly against the client's sheet
(`docs.google.com/spreadsheets/d/1pnvMq3ivOHr8hkJJOXi4q_ipJYtuGBC9XcsjV0Q953w`, tabs `gid=0`
Chinese and `gid=13601657` Indonesian — same 74 products, identical codes, zero duplicates,
zero malformed entries on both tabs):

- **`ERP編號` / `ERP` column = the authoritative Product Code** (format `A001`, `C021`, `P017`...
  — matches the decided format exactly). **`貨號` / `SKU` column is an internal/legacy reference
  number — do not seed from it.**
- Confirmed max number per prefix (seed the sequence counters from these):

  | Prefix | Max existing code | Next code | Category (from sheet's own `Category`/`分類` column) |
  |---|---|---|---|
  | A | A002 | A003 | Aksesoris (Hats, Shapewear, Accessories/Others) |
  | C | C021 | C022 | Atasan (Tee, Shirt, General Tops) |
  | D | D003 | D004 | CD (Panties, Multi-pack Underwear) |
  | J | J017 | J018 | Outer (Denim Jacket, UV Jacket, Blazer, Shirt Jacket) |
  | P | P017 | P018 | Bawahan (Long Pants, Shorts, Jeans, Trousers) |
  | T | T004 | T005 | Set (Sets/Matching Sets) |
  | U | U008 | U009 | Inner (Seamless Underwear, Bra Top, Sports Bra) |
  | V | V002 | V003 | Tanktop (Denim Vest, Tank Top, Vest) |

- Colors (`產品顏色` column) are still in Chinese and need translation/standardization per the
  client's own note — not blocking Phase 1, but a real data-cleanup task before/during import.

---

## 1. Product Code Auto-Generation

**Decisions locked in:** product-level code only, no variant-level code suffix (Decision 4);
3-digit zero-pad, rolls to 4 digits past 999 with no reset (`P999 → P1000`), fixed unique
prefix per category group, sequence independent per prefix (Decision 5); seed from the sheet
above (Decision 6, now resolved).

### Current Code
- `products.sku` is a free-text, manually-typed, nullable-unique column
  (`backend/cmd/api/migrations/038_product_master_sku.sql`).
- `backend/internal/handlers/products.go` `Create()` (~line 284) and `Update()` (~line 363)
  accept `req.SKU` directly from the client with no generation logic — whatever staff type is
  what gets stored (`NULLIF($1,'')` only strips empty string, no format/sequence enforcement).
- `frontend/src/pages/ProductForm.jsx` renders SKU as a plain text `<input>` the user types
  into directly (`updateField('sku', ...)`, around the SKU field near the name/category inputs).
- `categories` table (`backend/cmd/api/migrations/023_categories.sql`) has only `id, name,
  created_at` — no concept of a code prefix at all.

### Changes Needed
- **Migration**: `ALTER TABLE categories ADD COLUMN code_prefix VARCHAR(4);` — nullable at
  first (existing categories won't have one), then a data migration to assign the 8 confirmed
  prefixes to the matching category rows (or create the 8 categories fresh if they don't exist
  yet under these exact names, matching the client's own category labels above).
- **Migration**: a sequence-tracking mechanism, one counter per prefix (not per category row,
  since multiple category names can share one prefix — e.g. any category tagged prefix `C`
  draws from the same counter). Simplest reliable approach: a small
  `product_code_sequences (prefix VARCHAR(4) PRIMARY KEY, last_number INT NOT NULL)` table,
  seeded from section 0's table above. Generate the next code with an atomic
  `UPDATE product_code_sequences SET last_number = last_number + 1 WHERE prefix = $1
  RETURNING last_number` inside the same transaction as the product insert — avoids the
  race condition of two staff creating a product in the same category at once (a bare
  `SELECT MAX(...)` from `products.sku` would not be safe under concurrent writes).
- **Backend** (`products.go` `Create()`): stop accepting `sku` from the request body entirely.
  Instead, look up the selected category's `code_prefix`, atomically increment its counter
  (as above), format as `{prefix}{number:03d}` (or wider once >999), and use that as the
  inserted `sku`. Existing products' `sku` values are never touched by this change.
- **Backend** (`Update()`): product code becomes read-only after creation — drop `sku` from
  `updateProductRequest` (or keep it accepted but ignored, matching the pattern used for the
  admin-only `cost` field).
- **Frontend** (`ProductForm.jsx`): remove the SKU text input on create; show the code as
  read-only, populated only after category is selected and the product is saved (or via a
  "preview next code" call if you want to show it before saving — simplest is to generate on
  save and display the result). On edit, show the existing code as plain read-only text.

### How to Test
1. Create a new product under an existing category mapped to prefix `P` (e.g. "Bawahan").
   Confirm the generated code is `P018` (next after the seeded max `P017`).
2. Create another product in the same category immediately after — confirm it gets `P019`,
   not a collision or a re-used number.
3. Open two browser tabs, submit "create product" in the same category from both within a
   second of each other (or script two concurrent `POST /products` calls) — confirm you get
   two distinct sequential codes, not a duplicate.
4. Confirm an existing product's code (e.g. one of the real 74 seeded ones) is completely
   unchanged after the migration runs — `SELECT sku FROM products WHERE sku = 'P017'` should
   still exist and be untouched.
5. Confirm the SKU field is no longer editable/typeable anywhere in the product create/edit UI.

---

## 2. New Product Flow (Purchasing becomes select-only)

**Decision context:** confirms products must be created in Product Management first; Purchasing
never creates a product, only selects an existing one.

### Current Code
- `frontend/src/pages/Purchases.jsx` (`CreatePurchaseModal`, ~lines 12-95): the product/variant
  picker is a single flat `<select>` listing **every variant of every product** in one
  dropdown (`allVariants = products.flatMap(...)`, rendered as
  `<option>{productName} - {color}/{size} ({sku})</option>`) — no search, and at real-catalog
  scale (hundreds of variants) this is already close to unusable.
- There is no "create new product" path inside Purchasing today, so nothing needs to be
  *removed* — but the picker itself needs to become a real search, not just stay a flat list.

### Changes Needed
- **Frontend only.** Replace the flat `<select>` in `CreatePurchaseModal` with a searchable
  picker — reuse the `ProductSearchBox` component already extracted to
  `frontend/src/components/ProductSearchBox.jsx` (built for the Product Color Pair page) as the
  product-level search, then a secondary variant (color/size) selector that populates once a
  product is chosen — mirroring the "Supplier A → P017 → Black/M → Qty" flow described in the
  client's email.
- No backend change required — `POST /purchases` already takes `variant_id` per line
  (`backend/internal/handlers/purchases.go` `createPurchaseItem`), this is purely a frontend
  UX fix.

### How to Test
1. Open Create Purchase, confirm you can type a product name or code to filter instead of
   scrolling one giant dropdown.
2. Pick a product, confirm only that product's actual color/size variants show up next, not
   every variant in the catalog.
3. Confirm there is no way to type/submit a product or variant that doesn't already exist.

---

## 3. Supplier Management: Fields, Tags, Attachments

### Current Code
- `suppliers` table (`backend/cmd/api/migrations/035_suppliers_purchases.sql`): `id, name,
  contact_name, phone, address, is_active, created_at`. No Supplier ID display code, no
  WeChat, no tags, no attachments, no status beyond active/inactive.
- `backend/internal/handlers/suppliers.go` (119 lines): plain CRUD, `List()` filters only on
  `is_active`, no tag/category filtering.
- `frontend/src/pages/Suppliers.jsx` (89 lines): basic list + form for the fields above.
- `backend/internal/handlers/uploads.go` `UploadImage()`: accepts **one image at a time**,
  image types only (`allowedImageTypes`), 5MB max — not built for arbitrary
  documents/screenshots or multiple files per record.

### Changes Needed
- **Migration**: extend `suppliers` — add `display_code VARCHAR(20) UNIQUE` (auto-numbered,
  e.g. `SUP-001`, simple sequential, no category-prefix logic needed here), `wechat
  VARCHAR(100)`, `notes TEXT`, `status VARCHAR(20) NOT NULL DEFAULT 'complete'` (values
  `complete`/`incomplete`).
- **Migration**: tag support for Category/Style/Price Range. Given ~300 suppliers and the need
  for fast multi-value filtering, use three `TEXT[]` columns (`categories TEXT[]`, `styles
  TEXT[]`, `price_ranges TEXT[]`) with GIN indexes (`CREATE INDEX ... USING GIN (categories)`)
  rather than a separate tags join table — simpler to query and index for this scale, and
  avoids a 4th table for what's really just a multi-select filter.
- **Migration**: `supplier_attachments (id, supplier_id, url, filename, uploaded_at)` — one
  supplier can have many.
- **Backend** (`uploads.go`): broaden to accept common document/image types (PDF, PNG, JPEG,
  WebP) and raise the size ceiling if needed for screenshots; add a generic "attach to record"
  endpoint (or reuse the existing upload + a new `POST /suppliers/:id/attachments` to link it).
- **Backend** (`suppliers.go`): extend `supplierView`/`supplierRequest` with the new fields;
  `List()` gains query params for `category`, `style`, `price_range` (array-contains filter)
  and `status`.
- **Frontend** (`Suppliers.jsx`): add the new fields to the form, tag-input UI for
  Category/Style/Price Range (chips, not free text, to keep filtering reliable), a
  Complete/Incomplete status badge, an attachments uploader, and filter chips above the list
  (reuse `frontend/src/components/FilterChip.jsx`, already used elsewhere in this codebase).

### How to Test
1. Create a supplier with 2+ category tags, a style tag, and a price range tag; confirm they
   save and redisplay correctly.
2. Filter the supplier list by one category tag — confirm only matching suppliers show.
3. Combine two filters (category + style) — confirm it's an AND, not an OR, unless you decide
   otherwise (confirm with the client which behavior they expect at 300-supplier scale).
4. Upload a non-image attachment (e.g. a WeChat screenshot as PNG, and a PDF if you extend
   that far) to a supplier, confirm it's listed and downloadable.
5. Seed ~300 dummy suppliers (a quick script/migration) and confirm the filtered list still
   feels fast — this is the scale the client explicitly called out.

---

## 4. New Supplier During Purchasing (inline quick-add)

### Current Code
Doesn't exist in any form — `Purchases.jsx`'s supplier `<select>` only lists suppliers already
fully created via the separate Supplier Management page (`listSuppliers()` call, plain
dropdown).

### Changes Needed
- **Frontend**: add a "+ Add New Supplier" option inside `CreatePurchaseModal`'s supplier
  `<select>` (or a button beside it) that opens a small inline modal capturing just Name and
  WeChat.
- On submit, `POST /suppliers` with `status: 'incomplete'` (only Name + WeChat filled, per
  section 3's new `status` column), then immediately select the new supplier in the purchase
  form without closing/reloading it.
- **Backend**: no new endpoint needed — reuses `SupplierHandler.Create()` from section 3, just
  make sure `status` defaults to `incomplete` when only minimal fields are provided (or have
  the frontend send it explicitly).
- **Frontend** (`Suppliers.jsx`): add a filter/banner for suppliers with `status = incomplete`
  so staff have a way to come back and finish them — e.g. a dismissible "3 suppliers need more
  info" banner, or a status filter chip.

### How to Test
1. Start creating a purchase, click "+ Add New Supplier", enter only Name + WeChat, submit.
2. Confirm the purchase form now has that supplier selected and you can continue the purchase
   without leaving the page.
3. Confirm the purchase itself saves successfully (not blocked by the incomplete supplier).
4. Go to Supplier Management, confirm the new supplier appears marked "Incomplete."
5. Confirm there's a visible way to find all "Incomplete" suppliers (filter/banner) to follow
   up on later.

---

## 5. Purchasing Management: ETA, Purchase ID, Attachments, Status Flow

**Decision context (#8):** over-receiving is allowed with a warning — the *original* purchase
order still only ever receives its ordered quantity; the extra amount becomes a **new**,
separate purchase record (auto-filled with the same supplier/product/cost, just needing
confirmation), not an edit to the original quantity. Partial receiving: the already-received
quantity is locked; only the unreceived remainder can be adjusted or cancelled.

### Current Code
- `purchases` table (migration `035`): `id, supplier_id, order_date, status ('waiting'|
  'received'), notes, created_by, created_at, received_at`. No ETA, no human-readable ID, no
  attachments.
- `purchase_items`: `id, purchase_id, variant_id, qty, unit_cost`. No `received_qty` — nothing
  tracks partial fulfillment.
- `backend/internal/handlers/purchases.go` `Receive()` (~line 193-260): all-or-nothing — moves
  the **entire** `qty` of every line straight from nothing into `available_stock` in one shot,
  sets purchase status to `received`. No partial-quantity path exists at all today.
- `Delete()` only allows deleting a purchase still in `waiting` status — no edit/cancel
  semantics for a partially-received purchase (because partial receiving doesn't exist yet).

### Changes Needed
- **Migration**: `ALTER TABLE purchases ADD COLUMN eta DATE, ADD COLUMN purchase_no VARCHAR(30)
  UNIQUE;` (generate `purchase_no` server-side on create, e.g. `PO-2026-0001`, sequential —
  same atomic-counter pattern as section 1, simpler since it's a single global sequence, not
  per-prefix). Extend `status` to a 3-state flow: `waiting → partially_received → received`
  (plus `cancelled` if you want explicit cancellation instead of delete).
- **Migration**: `ALTER TABLE purchase_items ADD COLUMN received_qty INT NOT NULL DEFAULT 0;`
  — tracks cumulative received amount per line, separate from the ordered `qty`.
- **Migration**: `purchase_attachments (id, purchase_id, url, filename, uploaded_at)` — same
  shape as section 3's supplier attachments; reuse the same broadened upload endpoint.
- **Backend** (`Create()`): generate `purchase_no`; accept `eta`.
- **Backend**: replace the all-or-nothing `Receive()` with a per-line partial-receive endpoint,
  e.g. `POST /purchases/:id/receive` accepting `{items: [{item_id, received_qty}]}`:
  - For each line: `received_qty` capped at *up to and including* the ordered `qty` normally;
    if the caller submits more than the remaining unreceived amount (**over-receiving**),
    accept it but (a) only apply the ordered remainder to *this* line, (b) show a warning in
    the response, and (c) create a **new** `purchases`/`purchase_items` row for the excess,
    pre-filled with the same `supplier_id`, `variant_id`, `unit_cost` as the original line, in
    `waiting` status awaiting the same confirmation flow (per Decision 8 — this keeps the
    original PO's quantity untouched, exactly as specified).
  - Recompute the parent purchase's status from its lines: all lines fully received →
    `received`; some but not all → `partially_received`; none → stays `waiting`.
  - Wire into inventory per section 7 below.
- **Backend** (`Update`/`Delete`): once a purchase has any `received_qty > 0`, block editing or
  cancelling the received portion; only the unreceived remainder (`qty - received_qty` per
  line) may be adjusted or the whole line cancelled if nothing on it has been received yet.
- **Frontend** (`Purchases.jsx`): add ETA and Purchase ID to the create form and list/detail
  views; add an attachments uploader; change the "Receive" action into a per-line quantity
  input (defaulting to the remaining unreceived amount) instead of a single confirm button;
  show a status badge for all 3(+1) states; surface the over-receiving warning and link to the
  auto-created follow-up purchase record when it happens.

### How to Test
1. Create a purchase with an ETA and an attachment (e.g. a WeChat order screenshot). Confirm
   `purchase_no` is generated and shown.
2. Order 200 of a variant, receive 120. Confirm: purchase status becomes `partially_received`,
   the line's `received_qty` = 120, and (per section 7) `available_stock +120`,
   `incoming_stock` still carrying the remaining 80.
3. Receive the remaining 80. Confirm status flips to `received`.
4. Order 100, receive 105 (over-receive). Confirm: the original purchase still shows
   `received_qty = 100` / fully received, a warning is shown, and a **new** purchase record
   exists for the extra 5, pre-filled with the same supplier/product/cost, in `waiting` status.
5. With a purchase partially received, try to edit/cancel the *already-received* quantity —
   confirm it's blocked. Try adjusting/cancelling the *remaining unreceived* quantity — confirm
   it's allowed.

---

## 6. Product ↔ Supplier Relationship

**Decision context (#1, #7):** this is now much simpler than the original scope doc assumed.
One Product Code is tied to exactly **one supplier for its whole life** — if the supplier
changes, a *new* Product Code is created rather than re-pointing the existing one. So this
isn't really a many-to-many "derived from purchase history" join anymore; it's closer to a
single field.

### Current Code
No relationship tracked at all between `products` and `suppliers`.

### Changes Needed
- **Migration**: `ALTER TABLE products ADD COLUMN supplier_id INT REFERENCES suppliers(id);`
  — nullable (a brand-new product has no supplier until its first purchase, matching "Supplier
  should not be mandatory when creating a product").
- **Backend** (`purchases.go` `Create()`): when a purchase is created for a product that has no
  `supplier_id` yet, set it automatically to that purchase's supplier — this is the "locking"
  moment. If a purchase is created for a product that **already has** a `supplier_id` set to a
  *different* supplier than the one selected, this is the open case flagged earlier — **needs
  one more confirmation from the client**: block it outright, or just warn and let the new
  Product Code convention be a manual staff discipline rather than a system-enforced rule?
  Recommend blocking with a clear message ("This product is already sourced from Supplier X —
  create a new Product Code for Supplier Y instead") since the client was explicit that a
  supplier change should always mean a new code.
- **Frontend**: Product detail page shows its one linked supplier (name + link to Supplier
  Management); Supplier detail page lists all products with `supplier_id` = that supplier
  (a simple `WHERE supplier_id = $1` query, no join-through-purchases needed).

### How to Test
1. Create a product with no supplier — confirm the Product page shows "no supplier yet."
2. Create a purchase for it from Supplier A — confirm the product now shows Supplier A.
3. Attempt a second purchase for the *same* Product Code from Supplier B — confirm the system
   blocks it (once the above open question is resolved) with a message pointing at creating a
   new Product Code instead.
4. Open Supplier A's detail page — confirm the product from step 2 appears in its product list.

---

## 7. Purchasing ↔ Inventory Wiring

**Decision context (#3):** Incoming Stock **stays sellable** — confirms the current pick-gate
formula (`available_stock + incoming_stock - order_stock`) is correct and unchanged; only the
*source* of `incoming_stock` changes, from manual entry to purchase-driven.

### Current Code
- `incoming_stock` is a real column (`backend/cmd/api/migrations/015_inventory_extend.sql`) but
  is **manually typed** by staff in `frontend/src/pages/Inventory.jsx` (`VariantRow`, the
  incoming-stock input) and `frontend/src/pages/ProductForm.jsx` — no connection to actual
  purchase orders.
- It already counts toward the sellable/pickable total everywhere that matters:
  `backend/internal/handlers/orders.go:306` and `:363`, `backend/internal/handlers/picking.go:101`,
  and `backend/internal/handlers/products.go` (`TotalStock` computed field) all use
  `available_stock + incoming_stock - order_stock`.
- `purchases.go` `Receive()` (pre-section-5-changes) adds the full quantity straight to
  `available_stock` in one shot — never touches `incoming_stock` at all today, and has no
  partial-quantity concept.

### Changes Needed
- **Backend** (`purchases.go` `Create()`): after inserting the purchase and its line items,
  add each line's `qty` to `stock_buckets.incoming_stock` for that `variant_id`
  (`UPDATE stock_buckets SET incoming_stock = incoming_stock + $1 WHERE variant_id = $2`, same
  transaction as the purchase creation).
- **Backend** (the new partial-receive endpoint from section 5): on receiving `X` units of a
  line, `UPDATE stock_buckets SET incoming_stock = incoming_stock - $1, available_stock =
  available_stock + $1 WHERE variant_id = $2`, and log it via the existing `stock_movements`
  pattern (`purchases.go`'s current `Receive()` already does this for the full-receive case —
  extend the same logging call to the partial case).
- **Frontend**: once this is live, `incoming_stock` stops being an editable input in
  `Inventory.jsx` and `ProductForm.jsx` — render it read-only there (sourced only from open
  purchase orders) to prevent it drifting out of sync with real purchase data. Consider a
  small "why can't I edit this" tooltip linking to the relevant open purchase(s).
- **No change needed** to the pick-gate formula itself (`orders.go`, `picking.go`,
  `products.go`) — Decision #3 confirms it stays as-is.

### How to Test
1. Create a purchase for variant X, qty 100. Confirm `incoming_stock` for X immediately
   increases by 100 (check via `/inventory` or the API directly).
2. Confirm that stock is **already pickable/sellable** at this point (per Decision #3) — place
   a test order for more than `available_stock` alone but within `available + incoming`, confirm
   it's accepted.
3. Receive 60 of the 100. Confirm `available_stock +60`, `incoming_stock` drops to 40 (100-60).
4. Receive the remaining 40. Confirm `incoming_stock` returns to its pre-purchase baseline and
   `available_stock` has the full 100.
5. Confirm the Incoming Stock field in `Inventory.jsx`/`ProductForm.jsx` is no longer editable.
6. Re-run the item-013 alignment check (`docs` conversation history) to confirm the now-locked
   Incoming column still renders correctly in the grid.

---

## 8. Supplier Performance (Gross Profit, not NGR)

**Decision context (#1, #2):** NGR is **not needed** for supplier performance — use
`Supplier Gross Profit = GMV − Product Cost` instead. Since one Product Code = one supplier
(section 6), attribution is trivial — no splitting, no FIFO. Company-level NGR (Gross Profit
minus international shipping and other company-level costs) is deferred and out of scope here.

**Important connection to already-shipped work:** the `products.cost` field (admin-only,
`super_user`-gated) was already built in this codebase for the Profit page's Gross Profit
metric (`backend/internal/handlers/products.go`, `backend/internal/handlers/dashboard.go`).
This is the *same* "Product Cost" the client means in Decision #7 ("One Product Code is
associated with one supplier and one fixed Product Cost"). **Recommend**: once Purchasing
records a unit cost for a product's first (and only) purchase, auto-populate `products.cost`
from that purchase's `unit_cost` rather than leaving it purely admin-typed on the Product
form — this ties Purchasing, the existing company-level Gross Profit, and the new
Supplier Gross Profit all to the same single source of truth instead of three
independently-maintained cost values. Flag this connection back to the client/product owner
before building, since it changes how `products.cost` gets set (still admin-visible-only, but
now purchase-driven rather than hand-typed).

### Current Code
No supplier-dimension sales reporting exists. `backend/internal/handlers/reports.go` has
GMV/qty aggregation patterns to reuse (`pctOf()` helper, the `ProductPerformance` query shape),
but nothing keyed by supplier.

### Changes Needed
- **Backend**: new `SupplierHandler.Performance()` (or a new `SupplierPerformanceHandler`),
  one query per metric, all grouped by `supplier_id` (now a direct column on `products` per
  section 6, so no purchase-history join needed for attribution):
  - Total Purchase Amount / Quantity / Number of Purchases / Incoming Quantity — straight
    aggregates over `purchases`/`purchase_items` filtered to that supplier's products.
  - Quantity Sold / GMV — same `order_items` join pattern already used in `reports.go`,
    filtered to `products.supplier_id = $1`.
  - Gross Profit = `GMV - SUM(oi.qty * p.cost)` (reusing `products.cost` from item 012/section
    8's note above).
- **Route**: gated the same way as the other analytics tabs (`view("supplier_performance")`
  style middleware, new `role_tab_access` grant migration, following the exact precedent of
  `051_product_color_pair_tab.sql`).
- **Frontend**: new tab/section on the Supplier detail page (`Suppliers.jsx` or a new
  `SupplierDetail.jsx` if one doesn't exist yet) showing all 7 metrics from the client's list.

### How to Test
1. Pick a supplier with at least one received purchase and at least one sale of that product.
2. Manually compute expected Total Purchase Amount/Qty/Count from the purchase records, and
   expected GMV/Qty Sold from order data — confirm the dashboard matches exactly.
3. Confirm Gross Profit = GMV − (qty sold × that product's `products.cost`) matches a manual
   calculation.
4. Confirm a supplier with zero sales shows 0/empty gracefully, not an error or `NaN`.
5. Confirm the numbers update correctly after receiving a new purchase or completing a new
   sale for that supplier's product (no caching/staleness issue).

---

## Open Items Still Needing a Client Answer

These aren't blocking Phase 1 (product codes) but should be resolved before sections 6/8 ship:

1. **Section 6**: should the system hard-block a second purchase against an existing Product
   Code from a different supplier, or just warn? (Recommended: block.)
2. **Section 8**: confirm it's acceptable for `products.cost` to become purchase-driven
   (auto-set from the first purchase's unit cost) rather than purely admin-typed, since that's
   a change to how the already-shipped admin-cost feature behaves.
3. Whether row 018 in the client's tracker is meant to cover the full expanded scope here
   (product codes + relationship views + performance dashboard) or just the "supplier data /
   purchase history / automatic inventory" core — a commercial question, not a technical one.
