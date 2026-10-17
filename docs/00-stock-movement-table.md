# Stock Movement Reference Table

> Source of truth for stock logic since the Shipping Workbench (client Q&A, Question 4).
> The earlier checkout/reserve/pick model described in older docs is superseded.

## Fields (per product variant)

| Field | DB column | Meaning |
|---|---|---|
| **Actual** | `stock_buckets.available_stock` | Physical stock in the warehouse. Only this can be fulfilled through the 3PL. |
| **Incoming** | `stock_buckets.incoming_stock` | Purchased, not yet received. Sellable, but cannot be shipped. |
| **Ordered** | *derived* | Customer quantity not yet shipped: items on orders in `pending`, `processing`, `ready_to_ship`. Never stored (`orderedByVariantSQL`). |
| **Available** | *derived* | `Actual + Incoming - Ordered`. Negative = oversold. |
| Broken | `stock_buckets.broken_stock` | Damaged / non-resellable returns. |

`reserve_stock` and `order_stock` are no longer used (`order_stock` is always 0).

## Movement table

| Event | Actual | Incoming | Ordered | Available |
|---|---|---|---|---|
| Customer places an order | - | - | +qty | -qty |
| Shipping batch created / Excel exported / platform result imported | - | - | - | - |
| Purchase order confirmed | - | +qty | - | +qty |
| Purchase received | +qty | -qty | - | - |
| **3PL confirms shipment** (status `shipped`) | **-qty** | - | -qty | - |
| Delivery confirmed (`delivered`) | - | - | - | - |
| Order cancelled before shipment | - | - | -qty | +qty |
| Return requested (order `return`), goods not received | - | - | - | - |
| Returned goods received, resellable | +qty | - | - | +qty |
| Returned goods received, damaged | - (Broken +qty) | - | - | - |

## Rules

- Actual is deducted **once** per (order, variant): the unique index `uq_stock_movements_once` on
  `stock_movements` makes a repeated shipment import / click a no-op (`deductShipmentStock`).
- A returned item is restocked once per (order, variant) via `POST /orders/{id}/return-received`.
- A shipped order cannot be cancelled; it follows the return process.
- Shipping batches **allocate** physical stock (an order in a batch that has not shipped or been
  cancelled holds its quantity) without changing any field; allocation is derived, never stored.
  Allocatable = Actual - quantity held by unshipped batch orders. An order is only batchable if its
  whole quantity fits.
- Every change is a row in `stock_movements`, written in the same transaction as the stock update.

## Order statuses

`pending` (New) -> `processing` -> `ready_to_ship` -> `shipped` -> `delivered` (Completed);
final: `delivered`, `cancelled`, `return` (Returned).
- `processing`: the batch's initial shipping Excel was exported.
- `ready_to_ship`: the platform result was imported and the order matched.
- `shipped`: the 3PL confirmed actual shipment.
