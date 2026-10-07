// All calls are same-origin: nginx (prod) / the Vite dev proxy forward /api and /uploads to the
// Go backend. Product names are localized by the backend from X-Lang (default Indonesian).
const BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/public/store${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Lang': 'id', ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Terjadi kesalahan, coba lagi.')
    err.status = res.status
    throw err
  }
  return data
}

const qs = (params) => {
  const p = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const getSettings = () => request('/settings')
export const getCategories = () => request('/categories')
export const getPromotions = () => request('/promotions')
export const getProducts = (params) => request(`/products${qs(params)}`)
export const getProduct = (id) => request(`/products/${id}`)
export const quoteCart = (body) => request('/quote', { method: 'POST', body: JSON.stringify(body) })
export const createOrder = (body) => request('/orders', { method: 'POST', body: JSON.stringify(body) })
export const trackOrder = (orderNo, phone) => request(`/orders/track${qs({ order_no: orderNo, phone })}`)
export const subscribeNewsletter = (email) => request('/newsletter', { method: 'POST', body: JSON.stringify({ email }) })

// Product images are either absolute URLs (Cloudinary/seed) or relative /uploads/... paths.
export function img(url) {
  if (!url) return ''
  return url.startsWith('http') || url.startsWith('//') ? url : url
}
