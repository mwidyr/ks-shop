import client from './client'

// filters: { status, search, date } - search matches supplier name / internal product code
// (partial), date is the day the PO was created (yyyy-mm-dd); search and date combine.
export function listPurchases(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.date) params.set('date', filters.date)
  const q = params.toString()
  return client.get(`/purchases${q ? `?${q}` : ''}`).then((res) => res.data)
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

// Delivery batches (Split Delivery). Confirming a batch moves its actual qty from Incoming to
// Actual Stock; the PO status (Waiting -> Partially Received -> Received) follows automatically.
export function addPurchaseBatch(itemId, plannedQty) {
  return client.post(`/purchases/items/${itemId}/batches`, { planned_qty: plannedQty }).then((res) => res.data)
}

export function updatePurchaseBatch(batchId, plannedQty) {
  return client.patch(`/purchases/batches/${batchId}`, { planned_qty: plannedQty }).then((res) => res.data)
}

export function deletePurchaseBatch(batchId) {
  return client.delete(`/purchases/batches/${batchId}`).then((res) => res.data)
}

export function confirmPurchaseBatch(batchId, receivedQty) {
  return client.post(`/purchases/batches/${batchId}/receive`, { received_qty: receivedQty }).then((res) => res.data)
}
