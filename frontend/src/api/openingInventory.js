import client from './client'

// FIFO go-live, Initial Inventory Setup (#132) - super_user only.
export function listOpeningImports() {
  return client.get('/opening-inventory/imports').then((res) => res.data)
}

export function getOpeningImport(id) {
  return client.get(`/opening-inventory/imports/${id}`).then((res) => res.data)
}

// payload: { file_name, note, lines: [{ row_no, sku, qty, unit_cost_rmb, exchange_rate }] }
export function createOpeningImport(payload) {
  return client.post('/opening-inventory/imports', payload).then((res) => res.data)
}

export function approveOpeningImport(id) {
  return client.post(`/opening-inventory/imports/${id}/approve`).then((res) => res.data)
}

export function rejectOpeningImport(id) {
  return client.post(`/opening-inventory/imports/${id}/reject`).then((res) => res.data)
}
