import client from './client'

// Used broadly as reference data (filter dropdowns, product form) outside the Categories tab
// itself - see api/hosts.js's listHosts for why this resolves to [] instead of rejecting.
export function listCategories() {
  return client.get('/categories').then((res) => res.data).catch(() => [])
}

export function createCategory(nameZh, nameId) {
  return client.post('/categories', { name_zh: nameZh, name_id: nameId }).then((res) => res.data)
}

export function updateCategory(id, nameId) {
  return client.patch(`/categories/${id}`, { name_id: nameId }).then((res) => res.data)
}

export function deleteCategory(id) {
  return client.delete(`/categories/${id}`).then((res) => res.data)
}

export function mergeCategory(id, intoId) {
  return client.post(`/categories/${id}/merge`, { into_id: intoId }).then((res) => res.data)
}
