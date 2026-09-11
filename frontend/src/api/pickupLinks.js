import client from './client'

export function listPickupLinks(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/pickup-links?${q.toString()}`).then((res) => res.data)
}

export function createPickupLink(payload) {
  return client.post('/pickup-links', payload).then((res) => res.data)
}

export function updatePickupLink(id, status) {
  return client.patch(`/pickup-links/${id}`, { status }).then((res) => res.data)
}
