import client from './client'

export function listReturns(status) {
  const q = status ? `?status=${status}` : ''
  return client.get(`/returns${q}`).then((res) => res.data).catch(() => [])
}

// One page: { items, total, page, page_size }
export function listReturnsPage(status, page) {
  const q = new URLSearchParams({ page, page_size: 20, ...(status ? { status } : {}) })
  return client.get(`/returns?${q.toString()}`).then((res) => res.data)
}

export function createReturn(payload) {
  return client.post('/returns', payload).then((res) => res.data)
}

export function approveReturn(id) {
  return client.patch(`/returns/${id}/approve`).then((res) => res.data)
}

export function rejectReturn(id) {
  return client.patch(`/returns/${id}/reject`).then((res) => res.data)
}
