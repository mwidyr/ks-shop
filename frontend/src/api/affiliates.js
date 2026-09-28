import client from './client'

export function listAffiliates(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/affiliates${q}`).then((res) => res.data)
}

export function createAffiliate(payload) {
  return client.post('/affiliates', payload).then((res) => res.data)
}

export function updateAffiliate(id, payload) {
  return client.patch(`/affiliates/${id}`, payload).then((res) => res.data)
}

export function deleteAffiliate(id) {
  return client.delete(`/affiliates/${id}`).then((res) => res.data)
}
