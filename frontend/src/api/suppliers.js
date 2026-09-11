import client from './client'

export function listSuppliers(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/suppliers${q}`).then((res) => res.data)
}

export function createSupplier(payload) {
  return client.post('/suppliers', payload).then((res) => res.data)
}

export function updateSupplier(id, payload) {
  return client.patch(`/suppliers/${id}`, payload).then((res) => res.data)
}

export function deleteSupplier(id) {
  return client.delete(`/suppliers/${id}`).then((res) => res.data)
}
