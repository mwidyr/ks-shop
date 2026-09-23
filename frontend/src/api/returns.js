import client from './client'

export function listReturns(status) {
  const q = status ? `?status=${status}` : ''
  return client.get(`/returns${q}`).then((res) => res.data).catch(() => [])
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
