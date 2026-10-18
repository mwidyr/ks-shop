import client from './client'

export function listOrders(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/orders?${q.toString()}`).then((res) => res.data)
}

// Number of orders per status in the date range (the tab badges of the Orders page).
export function getOrderStatusCounts(range) {
  const q = new URLSearchParams(Object.entries(range ? { date_from: range.from, date_to: range.to } : {}).filter(([, v]) => v))
  return client.get(`/orders/status-counts?${q.toString()}`).then((res) => res.data)
}

export function getOrder(id) {
  return client.get(`/orders/${id}`).then((res) => res.data)
}

export function createOrder(payload) {
  return client.post('/orders', payload).then((res) => res.data)
}

export function updateOrderStatus(id, status, reason, confirmStopped) {
  return client.patch(`/orders/${id}/status`, { status, reason, confirm_stopped: Boolean(confirmStopped) }).then((res) => res.data)
}

export function updateOrderNotes(id, payload) {
  return client.patch(`/orders/${id}/notes`, payload).then((res) => res.data)
}

export function updateOrderKeepDate(id, keepDate) {
  return client.patch(`/orders/${id}/keep-date`, { keep_date: keepDate || null }).then((res) => res.data)
}

export function updateOrderPickup(id, payload) {
  return client.patch(`/orders/${id}/pickup`, payload).then((res) => res.data)
}

export function addOrderAttachment(id, url) {
  return client.post(`/orders/${id}/attachments`, { url }).then((res) => res.data)
}

export function splitOrder(id, itemIds) {
  return client.post(`/orders/${id}/split`, { item_ids: itemIds }).then((res) => res.data)
}

export function getMergeSuggestions() {
  return client.get('/orders/merge-suggestions').then((res) => res.data)
}

export function createMergeGroup(orderIds) {
  return client.post('/orders/merge-groups', { order_ids: orderIds }).then((res) => res.data)
}

export function deleteMergeGroup(groupId) {
  return client.delete(`/orders/merge-groups/${groupId}`).then((res) => res.data)
}

// Warehouse books returned goods back into stock: lines = [{variant_id, resellable_qty, broken_qty}]
export function markReturnReceived(id, lines, note) {
  return client.post(`/orders/${id}/return-received`, { lines, note }).then((res) => res.data)
}
