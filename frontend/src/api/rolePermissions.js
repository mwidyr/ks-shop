import client from './client'

export function getMyAccess() {
  return client.get('/my-access').then((res) => res.data)
}

export function listTabs() {
  return client.get('/tabs').then((res) => res.data)
}

export function getRoleTabAccess() {
  return client.get('/role-tab-access').then((res) => res.data)
}

export function updateRoleTabAccess(matrix) {
  return client.put('/role-tab-access', { matrix }).then((res) => res.data)
}
