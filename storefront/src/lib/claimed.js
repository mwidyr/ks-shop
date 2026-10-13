// Coupons the visitor claimed with a (live) code. Rights/values are always re-validated by the backend
// at checkout; this list is only what to show on "Kupon saya".
const KEY = 'ralulu_coupons_v1'
export function listClaimed() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}
export function saveClaimed(c) {
  const cur = listClaimed().filter((x) => x.code !== c.code)
  try { localStorage.setItem(KEY, JSON.stringify([{ ...c, claimedAt: Date.now() }, ...cur])) } catch { /* ignore */ }
}
export function markUsed(code) {
  const cur = listClaimed().map((x) => (x.code === code ? { ...x, usedAt: Date.now() } : x))
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { /* ignore */ }
}
