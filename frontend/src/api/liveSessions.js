import client from './client'

export function listLiveSessions(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/live-sessions?${q.toString()}`).then((res) => res.data)
}

export function startLiveSession(hostId, label) {
  return client.post('/live-sessions', { host_id: hostId, label }).then((res) => res.data)
}

export function endLiveSession(id) {
  return client.patch(`/live-sessions/${id}/end`).then((res) => res.data)
}
