import client from './client'

function buildQuery({ locationId, hostId, from, to, page } = {}) {
  const params = new URLSearchParams()
  if (locationId) params.set('location_id', locationId)
  if (hostId) params.set('host_id', hostId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (page) params.set('page', page)
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function getLifetime(filters) {
  return client.get(`/host-analytics/lifetime${buildQuery(filters)}`).then((res) => res.data)
}

export function getHostAnalyticsSummary(filters) {
  return client.get(`/host-analytics/summary${buildQuery(filters)}`).then((res) => res.data)
}

export function getHistoricalBest(filters) {
  return client.get(`/host-analytics/historical-best${buildQuery(filters)}`).then((res) => res.data)
}

export function getHostAnalyticsPerformanceData(filters) {
  return client.get(`/host-analytics/performance-data${buildQuery(filters)}`).then((res) => res.data)
}
