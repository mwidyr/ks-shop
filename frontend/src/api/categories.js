import client from './client'

// Used broadly as reference data (filter dropdowns, product form) outside the Categories tab
// itself - see api/hosts.js's listHosts for why this resolves to [] instead of rejecting.
export function listCategories() {
  return client.get('/categories').then((res) => res.data).catch(() => [])
}

export function createCategory(name) {
  return client.post('/categories', { name }).then((res) => res.data)
}

export function deleteCategory(id) {
  return client.delete(`/categories/${id}`).then((res) => res.data)
}
