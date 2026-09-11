import client from './client'

export function getProductReport(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/products?${q.toString()}`).then((res) => res.data)
}

export function getOrderReport(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/reports/orders?${q.toString()}`).then((res) => res.data)
}
