import client from './client'

export function getLocationShift({ from, to } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return client.get(`/performance-comparison/location-shift?${params}`).then((res) => res.data)
}

// One Custom Performance Comparison group. `range.allTime` asks for the whole history.
export function getCustomComparison({ channel, locationId, hostId, affiliateId, range }) {
  const params = new URLSearchParams()
  params.set('channel', channel)
  if (channel === 'live') {
    if (locationId) params.set('location_id', locationId)
    if (hostId) params.set('host_id', hostId)
  }
  if (channel === 'website' && affiliateId) params.set('affiliate_id', affiliateId)
  if (range.allTime) params.set('all_time', '1')
  else {
    params.set('from', range.from)
    params.set('to', range.to)
  }
  return client.get(`/performance-comparison/custom?${params}`).then((res) => res.data)
}
