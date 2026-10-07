import client from './client'

export function listUsers() {
  return client.get('/users').then((res) => res.data)
}

export function createUser(payload) {
  return client.post('/users', payload).then((res) => res.data)
}

export function updateUser(id, payload) {
  return client.patch(`/users/${id}`, payload).then((res) => res.data)
}

export function deleteUser(id) {
  return client.delete(`/users/${id}`).then((res) => res.data)
}

export function resendInvite(id) {
  return client.post(`/users/${id}/resend-invite`).then((res) => res.data)
}

export function setUserPassword(id, password) {
  return client.post(`/users/${id}/set-password`, { password }).then((res) => res.data)
}
