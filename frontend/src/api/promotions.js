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
// channel: 'live' (CS-only promotions) | 'website' (website + CS-only promotions)
export function availablePromotions(channel) {
  return client.get('/promotions/available', { params: { channel: channel || 'live' } }).then((res) => res.data)
}

// Promotion Purposes (Promotion Management > Purpose Settings); activeOnly = the order forms
export function listPromotionPurposes(activeOnly = false) {
  return client.get('/promotion-purposes', { params: activeOnly ? { active: 1 } : {} }).then((res) => res.data)
}
export function createPromotionPurpose(name) {
  return client.post('/promotion-purposes', { name }).then((res) => res.data)
}
export function updatePromotionPurpose(id, payload) {
  return client.patch(`/promotion-purposes/${id}`, payload).then((res) => res.data)
}
export function reorderPromotionPurposes(ids) {
  return client.put('/promotion-purposes/order', { ids }).then((res) => res.data)
}

// Promotion Management > Usage History: { summary, rows, total, page, page_size }
export function getPromotionUsage(params) {
  return client.get('/promotions/usage', { params }).then((res) => res.data)
}

// Read-only preview of every promotion on a cart (or on an existing order via order_id): nothing is saved or consumed.
export function previewPromotions(payload) {
  return client.post('/promotions/validate', payload).then((res) => res.data)
}

// CS changes the promotions of an order that has not started processing.
export function updateOrderPromotions(orderId, payload) {
  return client.put(`/orders/${orderId}/promotions`, payload).then((res) => res.data)
}
