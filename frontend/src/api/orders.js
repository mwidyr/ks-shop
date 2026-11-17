import client from './client'

export function listOrders(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/orders?${q.toString()}`).then((res) => res.data)
}

// Every order the filters match (all pages, 100 per request) for the Excel export. `max` caps the file;
// `truncated` tells the page when more orders matched than were fetched.
export async function listAllOrders(params, max = 10000) {
  const size = 100
  const first = await listOrders({ ...params, page: 1, page_size: size })
  const total = first.total || 0
  const pages = Math.min(Math.ceil(Math.min(total, max) / size), Math.ceil(max / size))
  const rest = []
  for (let from = 2; from <= pages; from += 5) {
    const batch = await Promise.all(Array.from({ length: Math.min(5, pages - from + 1) }, (_, i) => listOrders({ ...params, page: from + i, page_size: size })))
    rest.push(...batch)
  }
  const seen = new Set()
  const items = [first, ...rest].flatMap((r) => r.items || []).filter((o) => !seen.has(o.id) && seen.add(o.id)).slice(0, max)
  return { items, total, truncated: total > max }
}

// Orders short of stock (the Shipping Workbench's "Insufficient stock"), one line per missing SKU, for the Excel export.
export function getInsufficientStock(range) {
  const q = new URLSearchParams(Object.entries(range ? { date_from: range.from, date_to: range.to } : {}).filter(([, v]) => v))
  return client.get(`/orders/insufficient-stock?${q.toString()}`).then((res) => res.data)
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

export function updateOrderKeepDate(id, keepDate, keepDateType = 'shipping') {
  return client.patch(`/orders/${id}/keep-date`, { keep_date: keepDate || null, keep_date_type: keepDateType }).then((res) => res.data)
}

export function updateOrderPickup(id, payload) {
  return client.patch(`/orders/${id}/pickup`, payload).then((res) => res.data)
}

export function addOrderAttachment(id, url) {
  return client.post(`/orders/${id}/attachments`, { url }).then((res) => res.data)
}

export function deleteOrderAttachment(id, attachmentId) {
  return client.delete(`/orders/${id}/attachments/${attachmentId}`).then((res) => res.data)
}

export function splitOrder(id, itemIds) {
  return client.post(`/orders/${id}/split`, { item_ids: itemIds }).then((res) => res.data)
}

export function getMergeSuggestions() {
  return client.get('/orders/merge-suggestions').then((res) => res.data)
}

// customers with 2+ New orders whose shipping differs (not mergeable yet, but related)
export function getRelatedOrders() {
  return client.get('/orders/related-orders').then((res) => res.data)
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

// Full edit of an order that has not been exported yet (customer, delivery, items, amounts).
export function updateOrder(id, payload) {
  return client.put(`/orders/${id}`, payload).then((res) => res.data)
}

// The merged shipment is the editor of its orders: every item is written back to its original order.
export function getMergeGroup(groupId) {
  return client.get(`/orders/merge-groups/${groupId}`).then((res) => res.data)
}

export function updateMergeGroup(groupId, payload) {
  return client.put(`/orders/merge-groups/${groupId}`, payload).then((res) => res.data)
}
