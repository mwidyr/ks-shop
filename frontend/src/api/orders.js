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
