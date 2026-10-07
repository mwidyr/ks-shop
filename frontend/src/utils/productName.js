// Display name of a product in the current UI language, falling back to the canonical (Indonesian)
// name when that language has no translation. Only needed for data the backend returns with the
// raw name + names map (the products list); other endpoints already localize server-side.
export function localizedProductName(product, lang) {
  return (lang && product.names?.[lang]) || product.name
}

// Everything a search should match: the canonical name plus every translated name.
export function allProductNames(product) {
  return [product.name, ...Object.values(product.names || {})].join(' ').toLowerCase()
}
