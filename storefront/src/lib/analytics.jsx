import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from './store'

// Google Analytics 4 (#147). The measurement id comes from the server (GA4_MEASUREMENT_ID); without one nothing is
// loaded. The site is a single-page app, so the automatic page_view is switched off and one is sent per route change
// (path + search, which is what the ERP's Website Analytics page maps back to Product Code / article).
const ID_RE = /^G-[A-Z0-9]{4,20}$/

export function loadGtag(id) {
  if (!ID_RE.test(id || '') || window.__gaId === id) return false
  window.__gaId = id
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) } // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
  return true
}

export default function Analytics() {
  const { settings } = useStore()
  const id = settings.ga_measurement_id
  const { pathname, search } = useLocation()
  useEffect(() => { loadGtag(id) }, [id])
  useEffect(() => {
    if (!ID_RE.test(id || '') || typeof window.gtag !== 'function') return
    window.gtag('event', 'page_view', { page_path: pathname + search, page_location: window.location.href, page_title: document.title })
  }, [id, pathname, search])
  return null
}
