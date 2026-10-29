import client from './client'
import { cachedLookup, invalidateLookups } from './lookupCache'

export function listAffiliates(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return cachedLookup(`affiliates${q}`, () => client.get(`/affiliates${q}`).then((res) => res.data).catch(() => []))
}

export function createAffiliate(payload) {
  return client.post('/affiliates', payload).then((res) => { invalidateLookups('affiliates'); return res.data })
}

export function updateAffiliate(id, payload) {
  return client.patch(`/affiliates/${id}`, payload).then((res) => { invalidateLookups('affiliates'); return res.data })
}

export function deleteAffiliate(id) {
  return client.delete(`/affiliates/${id}`).then((res) => { invalidateLookups('affiliates'); return res.data })
}
