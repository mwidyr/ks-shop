-- Customer email for Taiwan e-invoices. Additive and nullable (metadata-only change, no table rewrite, safe while orders
-- are being created): customers.email is the last email known for the person (pre-fills the order form), and
-- orders.customer_email is the address that order's invoice goes to.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(150);
