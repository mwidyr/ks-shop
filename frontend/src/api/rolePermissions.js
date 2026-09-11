import client from './client'

export function listPermissions() {
  return client.get('/permissions').then((res) => res.data)
}

export function getRolePermissionMatrix() {
  return client.get('/role-permissions').then((res) => res.data)
}

export function updateRolePermissionMatrix(matrix) {
  return client.put('/role-permissions', { matrix }).then((res) => res.data)
}
