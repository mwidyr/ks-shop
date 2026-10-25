import client from './client'

// Website Analytics (GA4) for the shared Date Filter range.
export function getWebsiteAnalytics(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/analytics/website?${q.toString()}`).then((res) => res.data)
}
