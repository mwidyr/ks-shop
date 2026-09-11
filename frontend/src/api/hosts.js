import client from './client'

// Used broadly as reference data for filter dropdowns on pages outside the Hosts tab itself -
// a role without access to "hosts" shouldn't break whatever page it's filtering (e.g. Orders),
// so resolve to an empty list instead of rejecting.
export function listHosts(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/hosts${q}`).then((res) => res.data).catch(() => [])
}

export function createHost(payload) {
  return client.post('/hosts', payload).then((res) => res.data)
}

export function updateHost(id, payload) {
  return client.patch(`/hosts/${id}`, payload).then((res) => res.data)
}

export function deleteHost(id) {
  return client.delete(`/hosts/${id}`).then((res) => res.data)
}
