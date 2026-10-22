-- =========================================================
-- Adjust #127-#132: FIFO costing, valued in TWD in the background.
--
--   opening_inventory_imports/_lines  #132: at go-live staff upload verified on-hand quantities
--                     and approved unit costs (CSV); approving an import creates opening layers.
--                     FIFO is active from the first approved import on - before that no layer,
--                     reservation or COGS is written (past orders are never rewritten).
--   cost_layers       #127: one layer per received delivery batch (partial receipts each get their
--                     own) or opening line. Creating a PO adds nothing. qty_remaining is what is
--                     still unallocated.
--   cost_allocations  #128-#131: which layer an order item's units were costed from, oldest layer
--                     first. state: reserved (shipping Excel exported) -> final (3PL shipment
--                     confirmed) | released (cancelled before shipment, units back in the layer);
--                     final -> returned (sellable return, units back in the layer) | written_off
--                     (broken return: cost reversed, units not restocked).
--   order_items.cogs_twd   #130: FIFO cost of the shipped item, fixed when the shipment is confirmed
--                     - later purchase prices never change it. cogs_uncosted_qty counts units no
--                     layer could cover (oversold / stock received before go-live); such a cost
--                     is an estimate. cogs_reversed_twd is the part reversed by returns.
-- =========================================================

CREATE TABLE opening_inventory_imports (
    id SERIAL PRIMARY KEY,
    status VARCHAR(10) NOT NULL DEFAULT 'draft',   -- draft | approved | rejected
    file_name TEXT NOT NULL DEFAULT '',
    note TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by INT REFERENCES users(id),
    approved_at TIMESTAMPTZ
);

CREATE TABLE opening_inventory_lines (
    id SERIAL PRIMARY KEY,
    import_id INT NOT NULL REFERENCES opening_inventory_imports(id) ON DELETE CASCADE,
    row_no INT NOT NULL,
    sku TEXT NOT NULL,
    variant_id INT REFERENCES product_variants(id),
    qty INT NOT NULL CHECK (qty >= 0),
    unit_cost_rmb NUMERIC(14,4) NOT NULL CHECK (unit_cost_rmb >= 0),
    exchange_rate NUMERIC(12,6) NOT NULL CHECK (exchange_rate > 0),
    system_actual INT,          -- Actual stock when the file was uploaded, for the review
    error TEXT                  -- why the line can't be approved (unknown SKU, duplicate, ...)
);
CREATE INDEX idx_opening_inventory_lines_import ON opening_inventory_lines(import_id, row_no);

CREATE TABLE cost_layers (
    id BIGSERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(id),
    source VARCHAR(10) NOT NULL,                  -- receipt | opening
    purchase_item_batch_id INT UNIQUE REFERENCES purchase_item_batches(id),
    opening_line_id INT UNIQUE REFERENCES opening_inventory_lines(id),
    qty_in INT NOT NULL CHECK (qty_in > 0),
    qty_remaining INT NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_in),
    unit_cost_rmb NUMERIC(14,4) NOT NULL,
    exchange_rate NUMERIC(12,6) NOT NULL,
    unit_cost_twd NUMERIC(14,4) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_layers_open ON cost_layers(variant_id, received_at, id) WHERE qty_remaining > 0;

CREATE TABLE cost_allocations (
    id BIGSERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    order_item_id INT NOT NULL REFERENCES order_items(id),
    variant_id INT NOT NULL REFERENCES product_variants(id),
    layer_id BIGINT NOT NULL REFERENCES cost_layers(id),
    qty INT NOT NULL CHECK (qty > 0),
    unit_cost_twd NUMERIC(14,4) NOT NULL,
    state VARCHAR(12) NOT NULL,                   -- reserved | final | released | returned | written_off
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_allocations_order ON cost_allocations(order_id, state);
CREATE INDEX idx_cost_allocations_item ON cost_allocations(order_item_id);
CREATE INDEX idx_cost_allocations_layer ON cost_allocations(layer_id);

ALTER TABLE order_items
    ADD COLUMN cost_reserved_at TIMESTAMPTZ,
    ADD COLUMN cogs_twd NUMERIC(14,2),
    ADD COLUMN cogs_uncosted_qty INT NOT NULL DEFAULT 0,
    ADD COLUMN cogs_reversed_twd NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN cogs_finalized_at TIMESTAMPTZ;
