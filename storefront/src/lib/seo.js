import { useEffect } from 'react'

const SITE = 'ralulu'
function setMeta(name, content, attr = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`)
  if (!content) { if (el) el.remove(); return }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

// Per-page head: title, description, canonical, robots (noindex for search/cart/checkout/account),
// and optional JSON-LD. The server also injects the same tags into the HTML for crawlers.
export function useSeo({ title, description, canonical, noindex, jsonLd }) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : SITE
    setMeta('description', description)
    setMeta('robots', noindex ? 'noindex,nofollow' : '')
    let link = document.head.querySelector('link[rel="canonical"]')
    if (canonical) {
      if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }
      link.href = canonical.startsWith('http') ? canonical : `${window.location.origin}${canonical}`
    } else if (link) link.remove()
    let ld = document.head.querySelector('script[data-ld]')
    if (jsonLd) {
      if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.setAttribute('data-ld', '1'); document.head.appendChild(ld) }
      ld.textContent = JSON.stringify(jsonLd)
    } else if (ld) ld.remove()
    return () => {
      const l = document.head.querySelector('script[data-ld]')
      if (l) l.remove()
    }
  }, [title, description, canonical, noindex, JSON.stringify(jsonLd || null)]) // eslint-disable-line react-hooks/exhaustive-deps
}
