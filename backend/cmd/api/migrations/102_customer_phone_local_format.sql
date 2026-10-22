-- Customer phones are kept in the local Taiwan format (09xxxxxxxx) so ERP screens and shipping exports agree.
-- Storefront orders are now normalised on input (+886912345678 -> 0912345678); this converts the ones saved
-- earlier as typed. A customer is skipped when another customer already holds the local number.
UPDATE customers c
SET phone = '0' || (regexp_match(regexp_replace(c.phone, '[\s().-]', '', 'g'), '^(?:\+|00)?886(?:0)?(9[0-9]{8})$'))[1]
WHERE regexp_replace(c.phone, '[\s().-]', '', 'g') ~ '^(\+|00)?886(0)?9[0-9]{8}$'
  AND NOT EXISTS (
    SELECT 1 FROM customers o
    WHERE o.id <> c.id
      AND o.phone = '0' || (regexp_match(regexp_replace(c.phone, '[\s().-]', '', 'g'), '^(?:\+|00)?886(?:0)?(9[0-9]{8})$'))[1]
  );
