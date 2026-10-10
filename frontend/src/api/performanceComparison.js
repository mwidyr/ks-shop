import client from './client'

export function getLocationShift({ from, to } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return client.get(`/performance-comparison/location-shift?${params}`).then((res) => res.data)
}
