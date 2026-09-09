import client from './client'

export function listHosts(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/hosts${q}`).then((res) => res.data)
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
