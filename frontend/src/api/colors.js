import client from './client'

// Same shape/usage pattern as api/categories.js's listCategories - used broadly as reference
// data (product form color picker, display translation) outside the Color Management tab.
export function listColors() {
  return client.get('/colors').then((res) => res.data).catch(() => [])
}

// name_en (English) is also the color part of every variant SKU (C002-BLACK-F).
export function createColor(nameZh, nameId, nameEn) {
  return client.post('/colors', { name_zh: nameZh, name_id: nameId, name_en: nameEn }).then((res) => res.data)
}

// fields: { name_id?, name_en? } - a new English name recomputes the SKUs of that color.
export function updateColor(id, fields) {
  return client.patch(`/colors/${id}`, fields).then((res) => res.data)
}

export function deleteColor(id) {
  return client.delete(`/colors/${id}`).then((res) => res.data)
}

export function mergeColor(id, intoId) {
  return client.post(`/colors/${id}/merge`, { into_id: intoId }).then((res) => res.data)
}
