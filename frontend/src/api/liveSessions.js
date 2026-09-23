import client from './client'

export function listLiveSessions(params) {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  return client.get(`/live-sessions?${q.toString()}`).then((res) => res.data)
}

export function getLiveSession(id) {
  return client.get(`/live-sessions/${id}`).then((res) => res.data)
}

export function createLiveSession(label, hostId) {
  return client.post('/live-sessions', { label, host_id: hostId ?? null }).then((res) => res.data)
}

export function updateLiveSession(id, payload) {
  return client.patch(`/live-sessions/${id}`, payload).then((res) => res.data)
}

export function goLiveSession(id) {
  return client.patch(`/live-sessions/${id}/go-live`).then((res) => res.data)
}

export function endLiveSession(id) {
  return client.patch(`/live-sessions/${id}/end`).then((res) => res.data)
}

export function addLiveSessionProduct(id, variantId, livePrice) {
  return client.post(`/live-sessions/${id}/products`, { variant_id: variantId, live_price: livePrice }).then((res) => res.data)
}

export function removeLiveSessionProduct(id, cartItemId) {
  return client.delete(`/live-sessions/${id}/products/${cartItemId}`).then((res) => res.data)
}

export function submitLiveSessionData(id, payload) {
  return client.patch(`/live-sessions/${id}/live-data`, payload).then((res) => res.data)
}

// Deprecated alias kept for backward compatibility with the old start-session flow.
export function startLiveSession(hostId, label) {
  return createLiveSession(label, hostId)
}
