import { getLang } from './lang'

// All calls are same-origin: nginx (prod) / the Vite dev proxy forward /api and /uploads to the Go
// backend. Names/categories are localized by the backend from X-Lang.
const BASE = import.meta.env.VITE_API_URL || '/api'

export const MEMBER_TOKEN_KEY = 'ralulu_member_token'
const memberToken = () => { try { return localStorage.getItem(MEMBER_TOKEN_KEY) || '' } catch { return '' } }

async function http(path, options = {}) {
  const tok = memberToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Lang': getLang(), ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'error')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
const request = (path, options) => http(`/public/store${path}`, options)

const qs = (params) => {
  const p = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}
const post = (body) => ({ method: 'POST', body: JSON.stringify(body) })

export const getSettings = () => request('/settings')
export const getCategories = () => request('/categories')
export const getCategoryTree = () => request('/category-tree')
export const getPromotions = () => request('/promotions')
export const getProducts = (params) => request(`/products${qs(params)}`)
export const getProduct = (id) => request(`/products/${id}`)
export const getCards = (ids) => request(`/cards${qs({ ids: ids.join(',') })}`)
export const getHome = () => request('/home')
export const getCategoryLayout = () => request('/category-layout')
export const getHosts = (q) => request(`/hosts${qs({ q })}`)
export const getHost = (slug) => request(`/hosts/${encodeURIComponent(slug)}`)
export const getLive = () => request('/live')
// Public URL of an article card: /{lang}/style/{slug} (path comes from the API; the fallback is the old unprefixed URL).
export const contentHref = (c) => c.path || (c.type === 'host_article' && (c.author_slug || c.host) ? `/hosts/${c.author_slug || c.host}/journal/${c.slug}` : `/style/${c.slug}`)
export const CONTENT_LANGS = ['id', 'en', 'zh', 'vi']
export const getContentList = (params) => request(`/content${qs(params)}`)
export const getContent = (slug) => request(`/content/${encodeURIComponent(slug)}`)
export const searchAll = (q) => request(`/search${qs({ q })}`)
export const cvsSearch = (chain, q) => request(`/cvs/search${qs({ chain, q })}`)
export const claimCoupon = (code) => request('/coupons/claim', post({ code }))
export const requestRestock = (body) => request('/restock-requests', post(body))
export const submitReturn = (body) => request('/returns', post(body))
export const getWhatsAppOrder = (orderNo, phone) => request(`/whatsapp/order${qs({ order_no: orderNo, phone })}`)
export const quoteCart = (body) => request('/quote', post(body))
export const createOrder = (body) => request('/orders', post({ ...body, lang: getLang() }))
export const trackOrder = (orderNo, phone) => request(`/orders/track${qs({ order_no: orderNo, phone })}`)
export const getReviews = (id) => request(`/products/${id}/reviews`)
export const submitReview = (body) => request('/reviews', post(body))
// return photos: multipart to the rate-limited public upload (JPEG/PNG/WebP, 5MB)
export async function uploadPhoto(file) {
  const fd = new FormData()
  fd.append('image', file)
  const res = await fetch(`${BASE}/public/store/upload`, { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'upload failed')
  return data.url
}
// ---- accounts ----
const mget = (p) => http(p)
const mpost = (p, body) => http(p, post(body))
export const memberEmailRequest = (email, ref) => mpost('/public/member/email/request', { email, ref })
export const memberEmailVerify = (email, code) => mpost('/public/member/email/verify', { email, code })
export const memberWaStart = (phone, country, ref) => mpost('/public/member/wa/start', { phone, country, ref })
export const memberWaStatus = (id, phone, country) => mget(`/public/member/wa/status/${id}${qs({ phone, country })}`)
export const getMe = () => mget('/member/me')
export const patchProfile = (body) => http('/member/profile', { method: 'PATCH', body: JSON.stringify(body) })
export const getMemberFavorites = () => mget('/member/favorites')
export const setMemberFavorite = (id, on, price) => http(`/member/favorites/${id}`, { method: 'PUT', body: JSON.stringify({ on, price }) })
export const getMemberCoupons = () => mget('/member/coupons')
export const claimMemberCoupon = (code) => mpost('/member/coupons/claim', { code })
export const getMemberOrders = () => mget('/member/orders')
export const getLedger = (kind) => mget(`/member/ledger${qs({ kind })}`)
export const memberSync = (body) => mpost('/member/sync', body)
export const getThemePreview = (token) => http(`/theme/preview/${token}`)

// Product images are absolute URLs (Cloudinary/seed) or relative /uploads/... paths.
export const PLACEHOLDER_IMG = '/placeholder.svg'
export function img(url) {
  return url || PLACEHOLDER_IMG
}
// Cloudinary delivers WebP/AVIF at the displayed width; any other URL is returned unchanged.
export function sized(url, width) {
  if (!url) return PLACEHOLDER_IMG
  if (url.includes('res.cloudinary.com') && url.includes('/upload/') && !/\/upload\/[^/]*(w_|f_auto)/.test(url)) {
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
  }
  return url
}
export function srcSet(url, widths = [160, 320, 640]) {
  if (!url || !url.includes('res.cloudinary.com')) return undefined
  return widths.map((w) => `${sized(url, w)} ${w}w`).join(', ')
}
// <img onError>: a broken/missing photo falls back to the placeholder (once).
export function onImgError(e) {
  if (!e.currentTarget.src.endsWith(PLACEHOLDER_IMG)) e.currentTarget.src = PLACEHOLDER_IMG
}
