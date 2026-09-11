import client from './client'

export function listOrders(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/orders?${q.toString()}`).then((res) => res.data)
}

export function getOrder(id) {
  return client.get(`/orders/${id}`).then((res) => res.data)
}

export function createOrder(payload) {
  return client.post('/orders', payload).then((res) => res.data)
}

export function updateOrderStatus(id, status, reason) {
  return client.patch(`/orders/${id}/status`, { status, reason }).then((res) => res.data)
}

export function updateOrderNotes(id, internalNotes) {
  return client.patch(`/orders/${id}/notes`, { internal_notes: internalNotes }).then((res) => res.data)
}

export function addOrderAttachment(id, url) {
  return client.post(`/orders/${id}/attachments`, { url }).then((res) => res.data)
}

export function pickOrderItem(itemId, pickedQty) {
  return client.patch(`/order-items/${itemId}/pick`, { picked_qty: pickedQty }).then((res) => res.data)
}

export function splitOrder(id, itemIds) {
  return client.post(`/orders/${id}/split`, { item_ids: itemIds }).then((res) => res.data)
}

export function getPickingQueue(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/picking-queue?${q.toString()}`).then((res) => res.data)
}
