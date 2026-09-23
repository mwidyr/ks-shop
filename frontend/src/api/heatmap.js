import client from './client'

function buildQuery({ locationId, from, to, hostId, slot } = {}) {
  const params = new URLSearchParams()
  if (locationId) params.set('location_id', locationId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (hostId) params.set('host_id', hostId)
  if (slot != null) params.set('slot', slot)
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function getHeatmapSummary(filters) {
  return client.get(`/heatmap/summary${buildQuery(filters)}`).then((res) => res.data)
}

export function getHeatmapGrid(filters) {
  return client.get(`/heatmap/grid${buildQuery(filters)}`).then((res) => res.data)
}

export function getHeatmapCellDetail(filters) {
  return client.get(`/heatmap/cell-detail${buildQuery(filters)}`).then((res) => res.data)
}
