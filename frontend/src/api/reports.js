import client from './client'

export function getProductReport(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/products?${q.toString()}`).then((res) => res.data)
}

export function getOrderReport(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/orders?${q.toString()}`).then((res) => res.data)
}

export function getProductAnalysis(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/product-analysis?${q.toString()}`).then((res) => res.data)
}

export function getProductPerformance(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/product-performance?${q.toString()}`).then((res) => res.data)
}

export function getProductColorPair(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/product-color-pair?${q.toString()}`).then((res) => res.data)
}

export function getHostCategoryLeaderboard(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/host-category-leaderboard?${q.toString()}`).then((res) => res.data)
}
