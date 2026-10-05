-- When merging orders whose combined subtotal clears the free-shipping threshold, CreateGroup
-- (order_merge.go) now zeroes the fee-holder order's shipping_fee automatically. These columns
-- preserve what that order's shipping_fee/free_shipping_override were right before the waiver,
-- so DeleteGroup (unmerge) can restore them exactly rather than leaving the fee stuck at 0.
-- NULL means the merge never touched the fee (combined subtotal didn't clear the threshold, or
-- the order was already free), so there's nothing to restore on unmerge.
ALTER TABLE order_shipment_groups ADD COLUMN original_shipping_fee NUMERIC(14,2);
ALTER TABLE order_shipment_groups ADD COLUMN original_free_shipping_override BOOLEAN;
