import client from './client'

const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const getOverview = () => client.get('/shipping-workbench/overview').then((r) => r.data)
export const getIssues = (params) => client.get(`/shipping-workbench/issues${qs(params)}`).then((r) => r.data)
export const resolveIssue = (id) => client.post(`/shipping-workbench/issues/${id}/resolve`).then((r) => r.data)
export const getSettings = () => client.get('/shipping-workbench/settings').then((r) => r.data)
export const saveSettings = (body) => client.put('/shipping-workbench/settings', body).then((r) => r.data)

export const listBatches = (params) => client.get(`/shipping-workbench/batches${qs(params)}`).then((r) => r.data)
export const getBatch = (id) => client.get(`/shipping-workbench/batches/${id}`).then((r) => r.data)
export const listEligible = (provider) => client.get(`/shipping-workbench/eligible${qs({ provider })}`).then((r) => r.data)
export const createBatch = (provider, orderIds) =>
  client.post('/shipping-workbench/batches', { provider, order_ids: orderIds }).then((r) => r.data)

export const getExportRows = (batchId, kind, exportedAt) =>
  client.get(`/shipping-workbench/batches/${batchId}/export-rows${qs({ kind, exported_at: exportedAt })}`).then((r) => r.data)
export const recordExport = (batchId, kind, orderIds) =>
  client.post(`/shipping-workbench/batches/${batchId}/exports`, { kind, order_ids: orderIds }).then((r) => r.data)
export const confirmNotCreated = (batchId, orderId) =>
  client.post(`/shipping-workbench/batches/${batchId}/orders/${orderId}/confirm-failed`).then((r) => r.data)

export const importRecords = (body) => client.post('/shipping-workbench/imports', body).then((r) => r.data)
export const confirmAllNotCreated = (batchId) =>
  client.post(`/shipping-workbench/batches/${batchId}/confirm-all-failed`).then((r) => r.data)
