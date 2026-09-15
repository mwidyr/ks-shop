import client from './client'

// Validates a typed CVS store code against ECPay's real store directory (cached server-side).
// Returns { configured: false } if the backend has no ECPay credentials set up - callers
// should treat that as "can't check, don't warn" rather than a real not-found result.
export function validateStoreCode(chainType, code) {
  return client.get(`/pickup-stores/validate?chain_type=${encodeURIComponent(chainType)}&code=${encodeURIComponent(code)}`)
    .then((res) => res.data)
    .catch(() => ({ configured: false }))
}
