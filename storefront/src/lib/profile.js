import { useCallback, useEffect, useState } from 'react'

// Guest profile kept on this device only: recipient data (prefills checkout), body size (size hints),
// favourite stores (saved after each order) and addresses.
const KEY = 'ralulu_profile_v1'
const EVT = 'ralulu:profile'
export const EMPTY_PROFILE = { name: '', phone: '', email: '', birthday: '', height: '', weight: '', stores: [], addresses: [] }

export function readProfile() {
  try { return { ...EMPTY_PROFILE, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...EMPTY_PROFILE } }
}
export function writeProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT))
}
export function clearProfile() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}
// Remember a store used at checkout (first one becomes the default).
export function rememberStore(chain, store) {
  if (!store?.code) return
  const p = readProfile()
  if (p.stores.some((s) => s.chain === chain && s.code === store.code)) return
  writeProfile({ ...p, stores: [...p.stores, { chain, code: store.code, name: store.name || '', addr: store.addr || '', verified: store.verified !== false, isDefault: p.stores.length === 0 }].slice(-6) })
}

export function useProfile() {
  const [profile, setProfile] = useState(readProfile)
  useEffect(() => {
    const sync = () => setProfile(readProfile())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const save = useCallback((patch) => writeProfile({ ...readProfile(), ...patch }), [])
  return { profile, save }
}

// Suggest a size from the hosts who show the product: the host closest in height (and weight when known)
// within 8 cm. wear = [{host, height_cm, weight_kg, size}].
export function suggestSize(wear = [], height, weight) {
  const h = Number(height)
  if (!h || !wear.length) return null
  const w = Number(weight)
  const scored = wear.map((x) => ({ ...x, d: Math.abs(x.height_cm - h) + (w && x.weight_kg ? Math.abs(x.weight_kg - w) * 0.5 : 0) })).sort((a, b) => a.d - b.d)
  const best = scored[0]
  return Math.abs(best.height_cm - h) <= 8 ? best : null
}
