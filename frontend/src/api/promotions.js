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

export function validatePromotion(code, customerId, subtotal) {
  return client.post('/promotions/validate', { code, customer_id: customerId, subtotal }).then((res) => res.data)
}
