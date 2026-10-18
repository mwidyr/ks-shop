# Admin list performance: measurements

Measured on a scratch database with the demo data plus `scripts/seed_perf_data.sql`
(23,468 orders, 46,860 order items, 5,005 customers, 20,053 stock movements, 36 product variants),
local Postgres 16, one request at a time, median of 5 runs (`REQUEST_LOG=1` prints the same numbers
per request in the API log).

| Endpoint | Before (no indexes) | After (indexes + query changes) |
|---|---:|---:|
| Orders, page 1 | 23,422 ms | 5 ms |
| Orders, page 500 (deep) | ~27,000 ms | 6 ms |
| Orders, sort by total | 22,710 ms | 104 ms |
| Orders, status tab | ~23,000 ms | 3 ms |
| Orders, search by order no. | ~23,000 ms | 39 ms |
| Tab counts (old: `/dashboard/summary`) | 21,584 ms (on every sort / page / keystroke) | 5 ms (`/orders/status-counts`, only when the date range changes) |
| Audit Log, page 1 | 24 ms | 3 ms |
| Audit Log, page 200 | n/a | 12 ms |
| Shipping Workbench issues | 8 ms | 2 ms |

"Before" means the same code with the migration `097_perf_indexes.sql` indexes dropped; the Orders
query changes (lateral item aggregate, ids-first paging for date sorts) account for the deep-page gain
(449 ms -> 6 ms) on top of the indexes.

Final run after all changes (same data, 23,718 orders; median of 5, `scripts/seed_perf_data.sql`):

| Endpoint | Final |
|---|---:|
| Orders page 1 / deep page / status tab | 7 / 13 / 5 ms |
| Orders sorted by total | 182 ms |
| Orders search (order no. / name) | 47 / 38 ms |
| Status tab counts | 4 ms |
| Audit Log page 1 / page 200 | 3 / 13 ms |
| Shipping Workbench overview / issues / batches | 1 / 2 / 2 ms (overview is cached 10 s, dropped on every change) |
| Customers stats | 614 ms for the first call after a change, then 1 ms (cached 60 s). Response 45.6 KB -> 1.8 KB (one page of 25) |
| Dashboard / report / analytics routes | cached per user for 30 s; the old tab-count call was 21,584 ms before the indexes, 1 ms from the cache |
| Products (36 variants only) | 20-27 ms: the demo catalogue is too small to show a difference; paging is done in the browser (50 rows per page) |

## Paged lists (sprints 2 and 3)

Every list below now takes `page` / `page_size` (capped at 100) and answers `{items, total, page, page_size}`.
The ones that used to return everything still do when no `page` is sent, so other screens that load them
as a lookup are unaffected.

| List | Paging | Search / filter / sort |
|---|---|---|
| Orders | server | server |
| Customers | server (from a cached build of the stats) | server |
| Products | server, slim rows (`?page=`), full detail only by `?ids=` / `?export=1` | server |
| Inventory (`/inventory`) | server, 30 products per page, summary cards from one cached query | server |
| Audit Log | server | - |
| Returns, Purchase Requisitions, Purchases, Suppliers, Members, Live sessions | server | search / status / date as before |
| Shipping Workbench batches | server (from a 10 s cached aggregate) | server (problems first, newest or oldest) |

## Other changes
- Inventory edits send only Actual and Incoming stock (`PATCH /variants/{id}/stock`), not the whole variant.
- Hosts, pickup methods, locations and affiliates are fetched once per minute per browser (cleared on
  login, logout and whenever one of them is edited).
- Performance Dashboard and Host Performance reload only the table when the sort or page changes; Heatmap
  and Product Analytics keep the previous view (dimmed) while the next one loads.
- Supplier lists load contacts and notes only for the suppliers on the page; the stock history is capped
  at 500 rows; the site settings load in one query instead of ten.

Still to be measured on a production-size catalogue: `/products` and `/inventory` page queries (the demo
catalogue has 12 products).

## How to repeat
1. Scratch database, run the API once (applies migrations), `psql -f scripts/seed_perf_data.sql`.
2. `REQUEST_LOG=1` on the API, then call the endpoints; or `EXPLAIN (ANALYZE, BUFFERS)` the queries.
3. Remove with `scripts/clean_perf_data.sql`.
