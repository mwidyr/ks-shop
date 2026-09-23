import client from './client'

function buildQuery({ locationId, from, to, sort, dir } = {}) {
  const params = new URLSearchParams()
  if (locationId) params.set('location_id', locationId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (sort) params.set('sort', sort)
  if (dir) params.set('dir', dir)
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function getPerformanceSummary(filters) {
  return client.get(`/performance-dashboard/summary${buildQuery(filters)}`).then((res) => res.data)
}

export function getHostRanking(filters) {
  return client.get(`/performance-dashboard/host-ranking${buildQuery(filters)}`).then((res) => res.data)
}

export function getPerformanceData(filters) {
  return client.get(`/performance-dashboard/performance-data${buildQuery(filters)}`).then((res) => res.data)
}
