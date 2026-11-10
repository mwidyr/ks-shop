-- A POS / courier order must not carry the store name / code of an earlier 7-11 / FamilyMart choice: the
-- leftover made one order look like it had two shipping methods and kept it out of merge suggestions.
UPDATE orders o SET pickup_store_name = NULL, pickup_store_code = NULL
FROM pickup_chains pc
WHERE pc.id = o.pickup_chain_id AND pc.chain_type NOT IN ('cvs_711', 'cvs_familymart')
  AND (COALESCE(o.pickup_store_name,'') <> '' OR COALESCE(o.pickup_store_code,'') <> '');
