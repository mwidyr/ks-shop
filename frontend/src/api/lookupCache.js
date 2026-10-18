// A short-lived cache for reference lists (hosts, pickup methods, locations, affiliates) that nearly
// every page asks for on mount. Requests in flight are shared, results are kept for `ttlMs`, and a
// failed request is never kept. Whatever changes one of these lists calls invalidateLookups(); logging
// in or out clears everything (another user may see other data).
const store = new Map()

export function cachedLookup(key, loader, ttlMs = 60000) {
  const hit = store.get(key)
  if (hit && Date.now() < hit.expires) return hit.promise.then((v) => (Array.isArray(v) ? [...v] : v))
  const promise = loader().catch((err) => { store.delete(key); throw err })
  store.set(key, { promise, expires: Date.now() + ttlMs })
  return promise.then((v) => (Array.isArray(v) ? [...v] : v))
}

export function invalidateLookups(prefix = '') {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key)
}
