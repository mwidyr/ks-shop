import client from './client'

export function listPurchases(status) {
  const q = status ? `?status=${status}` : ''
  return client.get(`/purchases${q}`).then((res) => res.data)
}

export function getPurchase(id) {
  return client.get(`/purchases/${id}`).then((res) => res.data)
}

export function createPurchase(payload) {
  return client.post('/purchases', payload).then((res) => res.data)
}

export function updatePurchase(id, payload) {
  return client.patch(`/purchases/${id}`, payload).then((res) => res.data)
}

export function updatePurchaseStatus(id, status, reason) {
  return client.patch(`/purchases/${id}/status`, { status, reason }).then((res) => res.data)
}

export function receivePurchase(id, items) {
  return client.patch(`/purchases/${id}/receive`, items ? { items } : {}).then((res) => res.data)
}

export function deletePurchase(id) {
  return client.delete(`/purchases/${id}`).then((res) => res.data)
}

export function getPurchaseHistory(filters) {
  const params = new URLSearchParams()
  if (filters?.supplierId) params.set('supplier_id', filters.supplierId)
  if (filters?.productSku) params.set('product_sku', filters.productSku)
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  const q = params.toString()
  return client.get(`/purchases/history${q ? `?${q}` : ''}`).then((res) => res.data)
}
