// Text for a failed API call. Prefers the server's own message; when the server sent none (a crash,
// a proxy/permission error, a timeout, no connection) it says what actually happened - HTTP status and
// the start of the response body, or "no response" - instead of only a generic line, so a
// screenshot from a user is enough to tell where it failed.
export function describeError(err, fallback) {
  const msg = err?.response?.data?.error
  if (msg) return msg
  const status = err?.response?.status
  if (!status) return `${fallback} (${err?.code === 'ECONNABORTED' ? 'timeout' : 'tidak ada respons dari server'})`
  const body = err.response.data
  const text = typeof body === 'string' ? body : body && typeof body === 'object' ? JSON.stringify(body) : ''
  const snippet = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `${fallback} (HTTP ${status}${snippet ? `: ${snippet}` : ''})`
}
