import client from '../api/client'

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api').replace(/\/api\/?$/, '')

export function resolveUrl(url) {
  if (!url) return ''
  return url.startsWith('http') ? url : API_ORIGIN + url
}

export async function uploadImageFile(file) {
  const form = new FormData()
  form.append('image', file)
  const res = await client.post('/uploads/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data.url
}
