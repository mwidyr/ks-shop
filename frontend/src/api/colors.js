import client from './client'

// Same shape/usage pattern as api/categories.js's listCategories - used broadly as reference
// data (product form color picker, display translation) outside the Color Management tab.
export function listColors() {
  return client.get('/colors').then((res) => res.data).catch(() => [])
}

export function createColor(nameZh, nameId) {
  return client.post('/colors', { name_zh: nameZh, name_id: nameId }).then((res) => res.data)
}

export function updateColor(id, nameId) {
  return client.patch(`/colors/${id}`, { name_id: nameId }).then((res) => res.data)
}

export function deleteColor(id) {
  return client.delete(`/colors/${id}`).then((res) => res.data)
}
