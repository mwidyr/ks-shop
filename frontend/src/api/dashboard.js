import client from './client'

export function getSummary(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/summary?${q.toString()}`).then((res) => res.data)
}

export function getGraph(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/graph?${q.toString()}`).then((res) => res.data)
}

export function getHostRanking(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/host-ranking?${q.toString()}`).then((res) => res.data)
}

export function getTopProducts(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/top-products?${q.toString()}`).then((res) => res.data)
}

export function getProfit(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/profit?${q.toString()}`).then((res) => res.data)
}

export function getAlerts(range) {
  const q = new URLSearchParams(range || {})
  return client.get(`/dashboard/alerts?${q.toString()}`).then((res) => res.data)
}
