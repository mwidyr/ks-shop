import client from './client'

export function listCategories() {
  return client.get('/categories').then((res) => res.data)
}

export function createCategory(name) {
  return client.post('/categories', { name }).then((res) => res.data)
}

export function deleteCategory(id) {
  return client.delete(`/categories/${id}`).then((res) => res.data)
}
