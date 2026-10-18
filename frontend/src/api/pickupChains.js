import client from './client'
import { cachedLookup, invalidateLookups } from './lookupCache'

// Used broadly as reference data for filter dropdowns/pickup-method pickers outside the
// Shipping Settings tab itself - see listHosts for why this resolves to [] instead of rejecting.
export function listPickupChains(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return cachedLookup(`chains${q}`, () => client.get(`/pickup-chains${q}`).then((res) => res.data).catch(() => []))
}

export function createPickupChain(payload) {
  return client.post('/pickup-chains', payload).then((res) => { invalidateLookups('chains'); return res.data })
}

export function updatePickupChain(id, payload) {
  return client.patch(`/pickup-chains/${id}`, payload).then((res) => { invalidateLookups('chains'); return res.data })
}

export function deletePickupChain(id) {
  return client.delete(`/pickup-chains/${id}`).then((res) => { invalidateLookups('chains'); return res.data })
}
