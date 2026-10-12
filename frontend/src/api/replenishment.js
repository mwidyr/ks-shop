import client from './client'

export function listReplenishment(filters) {
  const params = new URLSearchParams()
  if (filters?.q) params.set('q', filters.q)
  if (filters?.supplierId) params.set('supplier_id', filters.supplierId)
  if (filters?.alert) params.set('alert', filters.alert)
  if (filters?.sort) params.set('sort', filters.sort)
  const q = params.toString()
  return client.get(`/replenishment${q ? `?${q}` : ''}`).then((res) => res.data)
}

export function saveReplenishmentSettings(settings) {
  return client.put('/replenishment/settings', settings).then((res) => res.data)
}
