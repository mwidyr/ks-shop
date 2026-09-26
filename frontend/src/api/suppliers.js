import client from './client'

export function listSuppliers(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/suppliers${q}`).then((res) => res.data)
}

export function getSupplier(id) {
  return client.get(`/suppliers/${id}`).then((res) => res.data)
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

export function createSupplierContact(id, payload) {
  return client.post(`/suppliers/${id}/contacts`, payload).then((res) => res.data)
}

export function deleteSupplierContact(id, contactId) {
  return client.delete(`/suppliers/${id}/contacts/${contactId}`).then((res) => res.data)
}

export function createSupplierNote(id, note) {
  return client.post(`/suppliers/${id}/notes`, { note }).then((res) => res.data)
}

export function createSupplierPriceReference(id, payload) {
  return client.post(`/suppliers/${id}/price-references`, payload).then((res) => res.data)
}

export function deleteSupplierPriceReference(id, priceRefId) {
  return client.delete(`/suppliers/${id}/price-references/${priceRefId}`).then((res) => res.data)
}
