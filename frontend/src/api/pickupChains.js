import client from './client'

export function listPickupChains(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/pickup-chains${q}`).then((res) => res.data)
}

export function createPickupChain(payload) {
  return client.post('/pickup-chains', payload).then((res) => res.data)
}

export function updatePickupChain(id, payload) {
  return client.patch(`/pickup-chains/${id}`, payload).then((res) => res.data)
}

export function deletePickupChain(id) {
  return client.delete(`/pickup-chains/${id}`).then((res) => res.data)
}
