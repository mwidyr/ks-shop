import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, getMemberFavorites, MEMBER_TOKEN_KEY, memberSync } from './api'
import { listLocalOrders } from './localOrders'
import { listClaimed } from './claimed'
import { clearProfile, readProfile, writeProfile } from './profile'

const Ctx = createContext(null)
const readToken = () => { try { return localStorage.getItem(MEMBER_TOKEN_KEY) || '' } catch { return '' } }
const FAV_KEY = 'ralulu_favorites_v1'
const FAV_EVT = 'ralulu:favorites'

// Website account. The session token lives on the device; `me` carries the profile, balance, points and counts.
// Guests keep working exactly as before (device-local favourites / orders / coupons / profile).
export function MemberProvider({ children }) {
  const [token, setToken] = useState(readToken)
  const [me, setMe] = useState(null)
  const [ready, setReady] = useState(!readToken())

  const refresh = useCallback(async () => {
    if (!readToken()) { setMe(null); setReady(true); return null }
    try {
      const m = await getMe()
      setMe(m)
      // a device with an empty local profile adopts the account's (name, size, saved stores / addresses)
      const local = readProfile()
      const sp = m.profile || {}
      if (!local.name && !local.height && !local.stores.length && !local.addresses.length) {
        writeProfile({ ...local, name: m.name || '', phone: m.phone ? `0${String(m.phone).replace(/^886/, '')}` : '', email: m.email || '', birthday: m.birthday || '', height: sp.height || '', weight: sp.weight || '', stores: sp.stores || [], addresses: sp.addresses || [] })
      }
      return m
    } catch (e) {
      if (e.status === 401) { try { localStorage.removeItem(MEMBER_TOKEN_KEY) } catch { /* ignore */ } setToken(''); setMe(null) }
      return null
    } finally { setReady(true) }
  }, [])
  useEffect(() => { refresh() }, [refresh, token])

  // After a successful login: store the session, merge what this device collected as a guest, pull the server
  // favourites back into the local list (so hearts show everywhere), then refresh the account.
  const login = useCallback(async (newToken, member, created) => {
    try { localStorage.setItem(MEMBER_TOKEN_KEY, newToken) } catch { /* private mode */ }
    setToken(newToken)
    setMe(member)
    try {
      const prof = readProfile()
      const favs = (() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } })()
      await memberSync({
        favorites: favs.map((f) => ({ id: f.id, price: f.price })), coupons: listClaimed().map((c) => c.code),
        orders: listLocalOrders().map((o) => ({ orderNo: o.orderNo, phone: o.phone })), name: prof.name,
        profile: { height: prof.height, weight: prof.weight, addresses: prof.addresses, stores: prof.stores },
      })
      const serverFavs = await getMemberFavorites()
      const local = serverFavs.map((f) => favs.find((x) => x.id === f.id) || { id: f.id, price: f.price, name: '', image: '' })
      localStorage.setItem(FAV_KEY, JSON.stringify(local))
      window.dispatchEvent(new Event(FAV_EVT))
    } catch { /* the account still works; sync can be retried on the next login */ }
    const m = await refresh()
    return { member: m, created }
  }, [refresh])

  // Logging out also clears what this device cached for the account (profile, favourites, coupons, order list),
  // so the next person on a shared phone does not see it. It all lives on the account and returns at the next login.
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(MEMBER_TOKEN_KEY)
      ;['ralulu_favorites_v1', 'ralulu_coupons_v1', 'ralulu_orders_v1'].forEach((k) => localStorage.removeItem(k))
      sessionStorage.removeItem('ralulu_checkout_v1')
    } catch { /* ignore */ }
    clearProfile()
    window.dispatchEvent(new Event(FAV_EVT))
    setToken(''); setMe(null)
  }, [])

  const value = useMemo(() => ({ token, me, ready, signedIn: Boolean(token && me), login, logout, refresh }), [token, me, ready, login, logout, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useMember = () => useContext(Ctx)
