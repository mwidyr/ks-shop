import client from './client'

export function listReplenishment(filters) {
  const params = new URLSearchParams()
  if (filters?.basis) params.set('basis', filters.basis)
  if (filters?.targetStockDays) params.set('target_stock_days', filters.targetStockDays)
  if (filters?.supplierId) params.set('supplier_id', filters.supplierId)
  if (filters?.category) params.set('category', filters.category)
  if (filters?.stockStatus) params.set('stock_status', filters.stockStatus)
  const q = params.toString()
  return client.get(`/replenishment${q ? `?${q}` : ''}`).then((res) => res.data)
}
