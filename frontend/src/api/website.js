import client from './client'

// Ralulu Hub -> customer website management (home modules, hosts, content, theme, settings, requests).
const get = (url) => client.get(url).then((r) => r.data)
const put = (url, body) => client.put(url, body).then((r) => r.data)
const post = (url, body) => client.post(url, body).then((r) => r.data)
const patch = (url, body) => client.patch(url, body).then((r) => r.data)

export const getHomeModules = () => get('/admin/home-modules')
export const saveHomeModules = (list) => put('/admin/home-modules', list)

export const getSiteSettings = () => get('/admin/site-settings')
export const saveSiteSettings = (body) => patch('/admin/site-settings', body)

export const listSiteHosts = () => get('/admin/site-hosts')
export const getSiteHost = (id) => get(`/admin/site-hosts/${id}`)
export const saveSiteHost = (id, body) => put(`/admin/site-hosts/${id}`, body)

// Article list: no params = the plain list (max 300); with `page` = { items, total, page, page_size }.
export const listContent = (params) => {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  const s = q.toString()
  return get(`/admin/content${s ? `?${s}` : ''}`)
}
export const getContent = (id) => get(`/admin/content/${id}`)
export const createContent = (body, mode) => post(`/admin/content${mode ? `?mode=${mode}` : ''}`, body)
// mode 'draft' = autosave / Save Draft: a published article keeps its live version and stores the form as its draft
export const updateContent = (id, body, mode) => put(`/admin/content/${id}${mode ? `?mode=${mode}` : ''}`, body)
export const discardContentDraft = (id) => client.delete(`/admin/content/${id}/draft`).then((r) => r.data)
export const checkContentSlug = (slug, excludeId) => get(`/admin/content/slug-check?slug=${encodeURIComponent(slug)}${excludeId ? `&exclude_id=${excludeId}` : ''}`)
export const listContentTags = (q) => get(`/admin/content/tags?q=${encodeURIComponent(q || '')}`)
export const listContentTypes = () => get('/admin/content-types')
export const createContentType = (names) => post('/admin/content-types', { names })
export const updateContentType = (id, names) => put(`/admin/content-types/${id}`, { names })
export const deleteContentType = (id) => client.delete(`/admin/content-types/${id}`).then((r) => r.data)
export const listContentTemplates = () => get('/admin/content-templates')
export const getContentTemplate = (id) => get(`/admin/content-templates/${id}`)
export const createContentTemplate = (name, blocks) => post('/admin/content-templates', { name, blocks })
export const updateContentTemplate = (id, name, blocks) => put(`/admin/content-templates/${id}`, { name, blocks })
export const deleteContentTemplate = (id) => client.delete(`/admin/content-templates/${id}`).then((r) => r.data)
export const deleteContent = (id) => client.delete(`/admin/content/${id}`).then((r) => r.data)

export const getProductSite = (id) => get(`/admin/product-site/${id}`)
export const saveProductSite = (id, body) => put(`/admin/product-site/${id}`, body)

export const listRestockRequests = () => get('/admin/restock-requests')
export const markRestockNotified = (id) => post(`/admin/restock-requests/${id}/notified`)
export const listWebReturns = () => get('/admin/web-returns')
export const setWebReturnStatus = (id, status) => patch(`/admin/web-returns/${id}`, { status })

export const getThemeDraft = () => get('/admin/theme/draft')
export const saveThemeDraft = (body) => put('/admin/theme/draft', body)
export const validateTheme = (tokens) => post('/admin/theme/validate', { tokens })
export const createThemePreview = () => post('/admin/theme/preview-link')
export const publishTheme = () => post('/admin/theme/publish')
export const listThemeVersions = () => get('/admin/theme/versions')
export const restoreThemeVersion = (id) => post(`/admin/theme/versions/${id}/restore`)
export const listThemePresets = () => get('/admin/theme/presets')
export const listProductReviews = (status) => get(`/admin/product-reviews${status ? `?status=${status}` : ''}`)
export const setReviewStatus = (id, status) => patch(`/admin/product-reviews/${id}`, { status })

export const listMembers = (q, page) => {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  if (page) { p.set('page', page); p.set('page_size', 25) } // paged: { items, total, ... }
  const s = p.toString()
  return get(`/admin/members${s ? `?${s}` : ''}`)
}
export const getMember = (id) => get(`/admin/members/${id}`)
export const adjustMember = (id, body) => post(`/admin/members/${id}/adjust`, body)
export const setMemberActive = (id, is_active) => patch(`/admin/members/${id}`, { is_active })
export const getRewardSettings = () => get('/admin/reward-settings')
export const saveRewardSettings = (body) => put('/admin/reward-settings', body)
