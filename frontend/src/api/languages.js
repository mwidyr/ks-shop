import client from './client'

// Reference data for the per-language product-name fields. Resolves to [] on failure (same
// convention as api/hosts.js) so a missing list never breaks the product form.
export function listLanguages(includeInactive) {
  const q = includeInactive ? '?include_inactive=true' : ''
  return client.get(`/languages${q}`).then((res) => res.data).catch(() => [])
}

export function createLanguage(payload) {
  return client.post('/languages', payload).then((res) => res.data)
}

export function updateLanguage(code, payload) {
  return client.patch(`/languages/${code}`, payload).then((res) => res.data)
}
