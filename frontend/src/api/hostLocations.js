import client from './client'

// Used broadly as reference data for the Host Management location select/filter -
// a role without access to "hosts" shouldn't break the page, so resolve to an
// empty list instead of rejecting (same convention as api/hosts.js).
export function listLocations(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/host-locations${q}`).then((res) => res.data).catch(() => [])
}

export function createLocation(payload) {
  return client.post('/host-locations', payload).then((res) => res.data)
}

export function updateLocation(id, payload) {
  return client.patch(`/host-locations/${id}`, payload).then((res) => res.data)
}

export function deleteLocation(id) {
  return client.delete(`/host-locations/${id}`).then((res) => res.data)
}
