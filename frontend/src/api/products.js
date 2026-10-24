import client from './client'

// Every product with full detail - for forms, pickers and analytics that need the whole catalogue.
// The Products page uses the three paged / filtered calls below instead.
export function listProducts() {
  return client.get('/products').then((res) => res.data)
}

const query = (params) => new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString()

// One page of slim rows: { items, total, page, page_size, counts: {all, active, inactive} }.
// params: page, page_size, q, tab, category, color, color_alt, stock, sort.
export function listProductsPage(params) {
  return client.get(`/products?${query({ page: 1, ...params })}`).then((res) => res.data)
}

// Full detail of the given products (the rows selected for a bulk action).
export function listProductsByIds(ids) {
  return client.get(`/products?ids=${ids.join(',')}`).then((res) => res.data)
}

// Full detail of every product matching the filters (CSV export).
export function listProductsForExport(params) {
  return client.get(`/products?${query({ ...params, export: 1 })}`).then((res) => res.data)
}

// One page of the Inventory page: { items, total, page, page_size, summary }.
export function listInventory(params) {
  return client.get(`/inventory?${query(params)}`).then((res) => res.data)
}

// Actual + Incoming stock of a variant (the only two numbers the Inventory page edits).
export function updateVariantStock(variantId, payload) {
  return client.patch(`/variants/${variantId}/stock`, payload).then((res) => res.data)
}

export function getProduct(id) {
  return client.get(`/products/${id}`).then((res) => res.data)
}

export function createProduct(payload) {
  return client.post('/products', payload).then((res) => res.data)
}

export function updateProduct(id, payload) {
  return client.patch(`/products/${id}`, payload).then((res) => res.data)
}

export function setProductActive(id, isActive) {
  return client.patch(`/products/${id}/active`, { is_active: isActive }).then((res) => res.data)
}

export function createVariant(productId, payload) {
  return client.post(`/products/${productId}/variants`, payload).then((res) => res.data)
}

export function updateVariant(productId, variantId, payload) {
  return client.patch(`/products/${productId}/variants/${variantId}`, payload).then((res) => res.data)
}

// Superuser only, with their password re-checked by the server (#140).
export function deleteProduct(id, force, password) {
  return client.delete(`/products/${id}${force ? '?force=true' : ''}`, { data: { password } }).then((res) => res.data)
}

export function deleteVariant(productId, variantId) {
  return client.delete(`/products/${productId}/variants/${variantId}`).then((res) => res.data)
}

export function addProductImage(productId, url) {
  return client.post(`/products/${productId}/images`, { url }).then((res) => res.data)
}

export function deleteProductImage(productId, imageId) {
  return client.delete(`/products/${productId}/images/${imageId}`).then((res) => res.data)
}

export function getStockHistory(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/inventory/history?${q.toString()}`).then((res) => res.data)
}

export function getProductPurchaseRules(productId) {
  return client.get(`/products/${productId}/purchase-rules`).then((res) => res.data)
}

export function updateProductPurchaseRules(productId, payload) {
  return client.patch(`/products/${productId}/purchase-rules`, payload).then((res) => res.data)
}

// super_user only (403 for everyone else) - resolves to null instead of rejecting so non-admins
// simply never get the card.
export function getInventoryValue() {
  return client.get('/inventory/value').then((res) => res.data.inventory_value).catch(() => null)
}

// Multi-supplier per variant (#125): every link of every variant of the product.
export function listVariantSuppliers(productId) {
  return client.get(`/products/${productId}/variant-suppliers`).then((res) => res.data)
}

// Replaces all links of the product's variants: [{ variant_id, supplier_id, supplier_product_code,
// url_1688, ref_price, currency, is_active, is_preferred }].
export function saveVariantSuppliers(productId, links) {
  return client.put(`/products/${productId}/variant-suppliers`, { links }).then((res) => res.data)
}

// Changes of the RMB default Product Cost (#133), newest first - super_user only.
export function getProductCostHistory(productId) {
  return client.get(`/products/${productId}/cost-history`).then((res) => res.data)
}

// Variants whose SKU still needs tidying before go-live (placeholder product code, color outside
// Color Master, collision suffix, manual SKU) - super_user only.
export function getSkuReport() {
  return client.get('/products/sku-report').then((res) => res.data)
}
