import client from './client'

export function listPromotions() {
  return client.get('/promotions').then((res) => res.data)
}

export function createPromotion(payload) {
  return client.post('/promotions', payload).then((res) => res.data)
}

export function updatePromotion(id, payload) {
  return client.patch(`/promotions/${id}`, payload).then((res) => res.data)
}

export function deletePromotion(id) {
  return client.delete(`/promotions/${id}`).then((res) => res.data)
}

// Promotions CS can pick on an order page (active, inside their dates, not used up).
export function availablePromotions() {
  return client.get('/promotions/available').then((res) => res.data)
}

// Read-only preview of every promotion on a cart (or on an existing order via order_id): nothing is saved or consumed.
export function previewPromotions(payload) {
  return client.post('/promotions/validate', payload).then((res) => res.data)
}

// CS changes the promotions of an order that has not started processing.
export function updateOrderPromotions(orderId, payload) {
  return client.put(`/orders/${orderId}/promotions`, payload).then((res) => res.data)
}
