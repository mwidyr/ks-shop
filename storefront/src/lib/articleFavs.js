import { useCallback, useEffect, useState } from 'react'

// Saved style articles (the "Artikel gaya" tab of the favourites page); device-local like product favourites.
const KEY = 'ralulu_fav_articles_v1'
const EVT = 'ralulu:fav-articles'
const read = () => { try { const raw = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(raw) ? raw : [] } catch { return [] } }

export function useArticleFavs() {
  const [items, setItems] = useState(read)
  useEffect(() => {
    const sync = () => setItems(read())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const toggle = useCallback((a) => {
    const cur = read()
    const next = cur.some((x) => x.slug === a.slug) ? cur.filter((x) => x.slug !== a.slug) : [{ slug: a.slug, title: a.title, summary: a.summary || '', cover: a.cover_url || '', type: a.type, host: a.author_slug || a.host_slug || '', path: a.path || '', savedAt: Date.now() }, ...cur]
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT))
  }, [])
  const has = useCallback((slug) => items.some((x) => x.slug === slug), [items])
  return { items, toggle, has, count: items.length }
}
