import client from './client'

export function searchCustomers(q) {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return client.get(`/customers${query}`).then((res) => res.data)
}

export function createCustomer(payload) {
  return client.post('/customers', payload).then((res) => res.data)
}

// { kpi: {...six cards}, customers: [one page], total, page, page_size } - merged by phone, valid
// orders only, see customers.go. Search, filters, sort and paging are done by the server; with
// params.export = 1 every matching customer comes back instead of one page.
export function listCustomerStats(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/customers/stats?${q.toString()}`).then((res) => res.data)
}

// Delivery history (latest first, deduped) + host purchase history for the Customer Detail panel.
export function getCustomerDetail(id) {
  return client.get(`/customers/${id}/detail`).then((res) => res.data)
}

export function setCustomerLabel(id, label, enabled) {
  return client.patch(`/customers/${id}/labels`, { label, enabled }).then((res) => res.data)
}

export function deleteCustomer(id) {
  return client.delete(`/customers/${id}`).then((res) => res.data)
}

// Internal staff notes on a customer profile (#138) - listed in getCustomerDetail().notes.
export function addCustomerNote(id, note) {
  return client.post(`/customers/${id}/notes`, { note }).then((res) => res.data)
}

export function updateCustomerNote(noteId, note) {
  return client.patch(`/customers/notes/${noteId}`, { note }).then((res) => res.data)
}

export function deleteCustomerNote(noteId) {
  return client.delete(`/customers/notes/${noteId}`).then((res) => res.data)
}
