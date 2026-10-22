package handlers

import "strings"

// Shared helpers for the list-page searches. A search is a plain "contains" match (ILIKE) with no
// minimum length - one character is a valid query - and the text is matched as typed, as a whole
// phrase. User-typed % and _ must not act as wildcards, so they are escaped.

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// escapeLike escapes the LIKE wildcards in s.
func escapeLike(s string) string { return likeEscaper.Replace(s) }

// likePattern is the "contains" pattern for q ("" when q is blank, meaning: no filter).
func likePattern(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	return "%" + escapeLike(q) + "%"
}

// prefixPattern is the "starts with" pattern for q, used to rank prefix matches first.
func prefixPattern(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	return escapeLike(q) + "%"
}

// productSearchSQL is the one predicate every product search uses. alias is the products table alias
// and like the placeholder (e.g. "$3") holding a likePattern. It looks at every product field a user
// can see or type: names (all languages), codes (product, supplier, live), category (stored value and
// its zh/id master names), brand, description, measurement note, supplier name, and each variant's
// code, color (and the color's master names) and size.
func productSearchSQL(alias, like string) string {
	a := alias + "."
	return `(` + a + `name ILIKE ` + like + ` OR ` + a + `names_search ILIKE ` + like +
		` OR COALESCE(` + a + `sku,'') ILIKE ` + like +
		` OR COALESCE(` + a + `vendor_sku,'') ILIKE ` + like +
		` OR COALESCE(` + a + `live_code,'') ILIKE ` + like +
		` OR COALESCE(` + a + `category,'') ILIKE ` + like +
		` OR COALESCE(` + a + `brand,'') ILIKE ` + like +
		` OR COALESCE(` + a + `description,'') ILIKE ` + like +
		` OR COALESCE(` + a + `measurement_note,'') ILIKE ` + like +
		` OR EXISTS (SELECT 1 FROM categories sct WHERE (sct.name = ` + a + `category OR sct.name_zh = ` + a + `category) AND (sct.name_zh ILIKE ` + like + ` OR sct.name_id ILIKE ` + like + `))` +
		` OR EXISTS (SELECT 1 FROM suppliers ssp WHERE ssp.id = ` + a + `supplier_id AND ssp.name ILIKE ` + like + `)` +
		` OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = ` + a + `id AND (sv.sku ILIKE ` + like +
		` OR EXISTS (SELECT 1 FROM variant_sku_history svh WHERE svh.variant_id = sv.id AND svh.old_sku ILIKE ` + like + `)` +
		` OR COALESCE(sv.color,'') ILIKE ` + like + ` OR COALESCE(sv.size,'') ILIKE ` + like +
		` OR EXISTS (SELECT 1 FROM colors scl WHERE (scl.name_zh = sv.color OR scl.name_id = sv.color) AND (scl.name_zh ILIKE ` + like + ` OR scl.name_id ILIKE ` + like + `)))))`
}

// searchRankSQL orders a search's matches by relevance, strongest first: the code starts with the text
// (0), the name starts with it (1), the code contains it (2), the name contains it (3), and everything
// else, matched in some other field (4). A one-letter search such as "C" matches almost every product,
// so this is what puts C001, C002 ... on the first page. prefix and like are placeholders ("$2", "$1")
// holding prefixPattern and likePattern of the same text.
func searchRankSQL(code, name, prefix, like string) string {
	return "CASE WHEN COALESCE(" + code + ",'') ILIKE " + prefix + " THEN 0 WHEN " + name + " ILIKE " + prefix +
		" THEN 1 WHEN COALESCE(" + code + ",'') ILIKE " + like + " THEN 2 WHEN " + name + " ILIKE " + like + " THEN 3 ELSE 4 END"
}
