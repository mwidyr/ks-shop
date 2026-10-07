import client from './client'

export function listProducts() {
  return client.get('/products').then((res) => res.data)
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

export function deleteProduct(id, force) {
  return client.delete(`/products/${id}${force ? '?force=true' : ''}`).then((res) => res.data)
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
