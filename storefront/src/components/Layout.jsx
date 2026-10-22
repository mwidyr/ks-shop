import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../lib/cart'
import FreeShipBar from './FreeShipBar'
import { useStore } from '../lib/store'
import { img } from '../lib/api'
import { useDesktop } from '../hooks/useMedia'
import { waUrl, topicText } from '../lib/wa'
import BottomNav from './BottomNav'
import CsFab from './CsFab'
import LangBar from './LangBar'
import Toast from './Toast'
import { QuickAddProvider } from './QuickAdd'
import { IconCart, IconHeadset, IconMenu, IconSearch, IconUser } from './Icons'

// Brand mark: the logo uploaded in the admin (Theme & Appearance) or, without one, the text wordmark.
function Logo({ size = 32, pad = 0 }) {
  const { settings } = useStore()
  const url = settings?.logo_url
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [url])
  return (
    <Link to="/" className="serif" aria-label={settings?.shop_name || 'ralulu'} style={{ ...logo(size), paddingLeft: pad, display: 'flex', alignItems: 'center' }}>
      {url && !broken
        ? <img src={img(url)} alt={settings?.shop_name || 'ralulu'} onError={() => setBroken(true)} style={{ height: size === 32 ? 30 : size, maxWidth: 150, objectFit: 'contain', display: 'block' }} />
        : 'ralulu'}
    </Link>
  )
}

const logo = (size = 32) => ({ fontSize: size, fontWeight: 700, fontStyle: 'italic', color: 'var(--color-primary-strong)', textDecoration: 'none' })

export function LiveButton() {
  return (
    <Link to="/live" className="live-pulse" style={{ height: 28, padding: '0 10px', borderRadius: 8, background: 'var(--color-live)', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, letterSpacing: 1, textDecoration: 'none' }}>
      <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--color-bg)' }} />LIVE
    </Link>
  )
}

export const HDR_H = 104 // LangBar 46 + MainHeader 58

// Mobile main header (pinned on every page by Layout): logo + LIVE + search + menu.
export function MainHeader() {
  const { t } = useTranslation()
  return (
    <header style={{ height: 58, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
      <Logo pad={8} />
      <LiveButton />
      <span style={{ flex: 1 }} />
      <Link to="/search" aria-label={t('nav.search_aria')} style={iconLink}><IconSearch size={20} /></Link>
      <Link to="/menu" aria-label={t('nav.menu')} style={iconLink}><IconMenu /></Link>
    </header>
  )
}
const iconLink = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }

// Desktop header (≥1024): logo, text navigation, search, CS, cart, menu.
export function DesktopHeader() {
  const { t, i18n } = useTranslation()
  const { count } = useCart()
  const { settings } = useStore()
  const link = ({ isActive }) => ({ fontSize: 15, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-primary-strong)' : 'var(--color-text)', textDecoration: 'none' })
  return (
    <header style={{ height: 72, display: 'flex', alignItems: 'center', gap: 28, padding: '0 40px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 40 }}>
      <Logo />
      <LiveButton />
      <nav aria-label={t('nav.main')} style={{ display: 'flex', gap: 22 }}>
        <NavLink to="/" end style={link}>{t('nav.home')}</NavLink>
        <NavLink to="/categories" style={link}>{t('nav.category')}</NavLink>
        <NavLink to="/hosts" style={link}>{t('desktop.hosts')}</NavLink>
        <NavLink to="/style" style={link}>{t('desktop.style')}</NavLink>
      </nav>
      <Link to="/search" style={{ flex: 1, minHeight: 46, borderRadius: 23, border: '1.5px solid var(--color-border-strong)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', color: 'var(--color-text-2)', fontSize: 15, textDecoration: 'none' }}>
        <IconSearch size={20} />{t('search.placeholder_short')}
      </Link>
      <a href={waUrl(settings.whatsapp_number, topicText(i18n.language, 'other'))} target="_blank" rel="noreferrer" style={{ minHeight: 46, padding: '0 18px', borderRadius: 23, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
        <IconHeadset size={20} />{t('nav.cs')}
      </a>
      <Link to="/cart" aria-label={t('nav.cart')} style={{ position: 'relative', width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}>
        <IconCart />
        {count > 0 && <span style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
      </Link>
      <Link to="/menu" aria-label={t('nav.account')} style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}><IconUser /></Link>
    </header>
  )
}

export function Footer() {
  const { t } = useTranslation()
  const { settings } = useStore()
  const a = { color: 'var(--color-text)', textDecoration: 'none' }
  const social = (label, url) => (
    <a key={label} href={url || '#'} target={url ? '_blank' : undefined} rel="noreferrer" style={{ flex: 1, minHeight: 40, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{label}</a>
  )
  return (
    <footer style={{ marginTop: 24, padding: '24px 16px 190px', background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Link to="/info/about" style={a}>{t('footer.about')}</Link>
        <Link to="/orders" style={a}>{t('footer.orders')}</Link>
        <Link to="/info/returns" style={a}>{t('footer.returns')}</Link>
        <Link to="/style" style={a}>{t('footer.style')}</Link>
        <Link to="/info/shipping" style={a}>{t('footer.shipping')}</Link>
        <Link to="/service" style={a}>{t('footer.cs_center')}</Link>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {social(t('footer.youtube'), settings.social?.youtube)}
        {social(t('footer.instagram'), settings.social?.instagram)}
        {social(t('footer.facebook'), settings.social?.facebook)}
        {social(t('footer.tiktok'), settings.social?.tiktok)}
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-disabled)' }}>{t('footer.copyright')}</span>
    </footer>
  )
}

// Pages that run their own bottom action bar (cart, checkout, product, return) hide the floating nav; every other page keeps it pinned.
const NO_NAV = [/^\/p\//, /^\/checkout(?!\/success)/, /^\/orders\/.+\/return/, /^\/cart/]

// Floating CS button: [bottom offset, single-line tip] per screen, as each artboard draws it.
const FAB = [
  [/^\/member/, 150, true], [/^\/orders\/[^/]+\/return/, 104, true], [/^\/orders/, 150, true], [/^\/profile/, 150, true], [/^\/live/, 150, true],
  [/^\/categories/, 100, false], [/^\/(products|c\/)/, 100, true], [/^\/p\//, 160, true], [/^\/cart/, 184, false], [/^\/checkout\/success/, 100, false],
  [/^\/checkout/, 104, false], [/^\/coupons/, 100, false], [/^\/search/, 100, false], [/^\/wishlist/, 100, true], [/^\/hosts/, 100, false],
  [/^\/style\/[^/]+/, 100, false], [/^\/style/, 100, true],
]
// article URLs start with the article language (/vi/style/x): the layout rules below are written without it
const stripLang = (p) => p.replace(/^\/(id|en|zh|vi)(?=\/)/, '')
function fabFor(rawPath) {
  const pathname = stripLang(rawPath)
  const hit = FAB.find(([re]) => re.test(pathname))
  return hit ? { bottom: hit[1], oneLine: hit[2] } : null
}

export default function Layout() {
  const { t } = useTranslation()
  const desktop = useDesktop()
  const { pathname: rawPathname } = useLocation()
  const pathname = stripLang(rawPathname)
  const hideNav = NO_NAV.some((r) => r.test(pathname))
  const fab = fabFor(pathname)
  const bare = /^\/language/.test(pathname)
  const noFab = /^\/(service|language|login|menu)/.test(pathname)

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  // the floating free-shipping bar (Home, cart not empty) lifts the CS button above it (artboard: bottom 150 vs 108)
  const { count } = useCart()
  const { threshold } = useStore()
  const showBar = !desktop && pathname === '/' && count > 0 && threshold > 0

  return (
    <QuickAddProvider>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', '--hdr-h': bare || desktop ? '0px' : `calc(${HDR_H}px + env(safe-area-inset-top))` }}>
        {!bare && desktop && <LangBar />}
        {!bare && !desktop && (
          <>
            {/* pinned on every mobile page: language marquee + logo bar; the spacer keeps page content below it */}
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, maxWidth: 560, margin: '0 auto', zIndex: 45, paddingTop: 'env(safe-area-inset-top)', background: 'var(--color-bg)' }}>
              <LangBar />
              <MainHeader />
            </div>
            <div aria-hidden style={{ height: 'var(--hdr-h)' }} />
          </>
        )}
        {desktop && !bare && <DesktopHeader />}
        <div style={{ maxWidth: desktop ? 1280 : 560, margin: '0 auto', position: 'relative' }}>
          <Outlet context={{ desktop }} />
        </div>
        {!desktop && !hideNav && <BottomNav />}
        {showBar && <FreeShipBar />}
        {!noFab && <CsFab bottom={desktop ? 40 : showBar ? 150 : fab ? fab.bottom : hideNav ? 92 : 108} oneLine={!desktop && fab?.oneLine} tip={/^\/checkout\/success/.test(pathname) ? t('co.fab_tip_order') : /^\/checkout/.test(pathname) ? t('co.fab_tip') : ''} />}
        <Toast />
      </div>
    </QuickAddProvider>
  )
}
