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

export function receivePurchase(id) {
  return client.patch(`/purchases/${id}/receive`).then((res) => res.data)
}

export function deletePurchase(id) {
  return client.delete(`/purchases/${id}`).then((res) => res.data)
}

export function listPurchaseAlert(days, atRiskOnly) {
  const q = new URLSearchParams({ days: days || 30, at_risk_only: atRiskOnly ? 'true' : '' })
  return client.get(`/purchase-alert?${q.toString()}`).then((res) => res.data)
}
