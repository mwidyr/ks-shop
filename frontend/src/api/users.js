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
