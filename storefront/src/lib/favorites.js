import { useCallback, useEffect, useState } from 'react'
import { MEMBER_TOKEN_KEY, setMemberFavorite } from './api'

// Favourites live on this device (guest mode). Each entry remembers the price it was saved at so the
// page can flag price drops.
const KEY = 'ralulu_favorites_v1'
const EVT = 'ralulu:favorites'

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function useFavorites() {
  const [items, setItems] = useState(read)
  useEffect(() => {
    const sync = () => setItems(read())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const toggle = useCallback((p) => {
    const cur = read()
    const next = cur.some((x) => x.id === p.id)
      ? cur.filter((x) => x.id !== p.id)
      : [{ id: p.id, price: p.price, name: p.name, image: p.image, savedAt: Date.now() }, ...cur]
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
    try { if (localStorage.getItem(MEMBER_TOKEN_KEY)) setMemberFavorite(p.id, next.some((x) => x.id === p.id), p.price).catch(() => {}) } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT))
  }, [])
  const has = useCallback((id) => items.some((x) => x.id === id), [items])
  return { items, toggle, has, count: items.length }
}
