import client from './client'

export function listCouriers(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/shipping-couriers${q}`).then((res) => res.data)
}

export function createCourier(payload) {
  return client.post('/shipping-couriers', payload).then((res) => res.data)
}

export function updateCourier(id, payload) {
  return client.patch(`/shipping-couriers/${id}`, payload).then((res) => res.data)
}

export function deleteCourier(id) {
  return client.delete(`/shipping-couriers/${id}`).then((res) => res.data)
}
