import { Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useAccess, useTabLevel } from '../context/AccessContext'
import EditLock from './EditLock'
import { getStoreSettings } from '../api/storeSettings'
import PreferencesModal from './PreferencesModal'
import { IconBell, IconChevronDown, IconLogout, IconSliders } from './icons'

import { navGroups, TOP_ITEMS, VISIBLE_TAB_KEYS, groupItems } from './navConfig'

// Title lookup: built from the nav itself, plus overrides for routes that aren't
// literal nav destinations (detail/create/edit/print pages).
const titleOverrides = [
  { prefix: '/orders/new', titleKey: 'shared.title_new_order' },
  { prefix: '/orders/merge', titleKey: 'page_merge_orders.heading' },
  { prefix: '/orders/print', titleKey: 'shared.title_print_order' },
  { prefix: '/orders/', titleKey: 'shared.title_order_detail' },
  { prefix: '/products/new', titleKey: 'shared.title_new_product' },
  { prefix: '/products/', titleKey: 'shared.title_edit_product' },
  { prefix: '/settings', titleKey: 'shared.title_settings' },
  { prefix: '/dashboard', titleKey: 'shared.title_dashboard' },
  { prefix: '/panel-siaran/history', titleKey: 'shared.title_session_history' },
  { prefix: '/panel-siaran/new', titleKey: 'shared.title_new_session' },
  { prefix: '/panel-siaran/', titleKey: 'shared.title_manage_session' },
  { prefix: '/purchases/history', titleKey: 'page_purchase_history.title' },
  { prefix: '/suppliers/', titleKey: 'page_suppliers.profile_title' },
]

// Open/closed state of the collapsible sections, remembered per browser. Top-level sections
// start open (as before) except Settings; subcategories start closed. The section holding the
// active page is always opened on navigation, so the highlight is never hidden.
const NAV_STATE_KEY = 'nav_open_sections'
const groupId = (group) => group.title
const subgroupId = (group, sg) => `${group.title}.${sg.title}`

function loadOpenSections() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_STATE_KEY) || 'null')
    if (saved && typeof saved === 'object') return saved
  } catch { /* storage unavailable: fall back to defaults */ }
  return {}
}

function buildTitleMap(t) {
  const map = titleOverrides.map((o) => ({ prefix: o.prefix, title: t(o.titleKey) }))
  for (const item of TOP_ITEMS) map.push({ prefix: item.to, title: t(`nav.items.${item.key}`) })
  for (const group of navGroups) {
    for (const item of groupItems(group)) {
      map.push({ prefix: item.to, title: t(`nav.items.${item.key}`) })
    }
  }
  return map
}

function pageTitle(pathname, t) {
  const titleMap = buildTitleMap(t)
  // Longest-prefix-first so a specific route (e.g. /settings/shipping) wins over a shorter,
  // more general one (e.g. /settings) regardless of which array it came from.
  const matches = titleMap.filter((entry) => pathname.startsWith(entry.prefix))
  matches.sort((a, b) => b.prefix.length - a.prefix.length)
  return matches[0] ? matches[0].title : t('brand.name')
}

// Always Jakarta time regardless of the viewer's own timezone/locale - operational fact for staff.
// It is its own component so the one-second tick re-renders only these few characters, not the whole
// shell (sidebar and page frame) once a second.
const clockFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
function JakartaClock() {
  const [clock, setClock] = useState(() => clockFormatter.format(new Date()))
  useEffect(() => {
    const id = setInterval(() => setClock(clockFormatter.format(new Date())), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{clock}</>
}

export default function AppShell({ children, lock }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { loaded: accessLoaded, isSuperUser: accessSuper, access: accessMap } = useAccess()
  const access = accessLoaded ? accessMap : null // null = still loading (show everything to avoid flicker)
  const isSuperUser = accessLoaded ? accessSuper : true
  const pageLevel = useTabLevel()
  const [blocked, setBlocked] = useState('') // set when the server refused a change (view-only role)
  const [shopName, setShopName] = useState(t('brand.name'))
  const [openSections, setOpenSections] = useState(loadOpenSections)

  useEffect(() => {
    getStoreSettings().then((res) => { if (res.shop_name) setShopName(res.shop_name) }).catch(() => {})
  }, [])

  // A tab is visible if it's super_user (always full access) or has any row (view/edit) - a
  // missing entry means "none". Still loading (access === null) shows everything to avoid a
  // flash of a mostly-empty sidebar before the real access map arrives.
  function canSeeTab(tabKey) {
    if (tabKey === 'telegram_settings') return access !== null && isSuperUser // Super Admin only
    if (tabKey === 'website_requests') tabKey = 'orders' // restock / return requests follow Orders access
    if (isSuperUser || access === null) return true
    return !!access[tabKey]
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initial = user?.name?.charAt(0)?.toUpperCase() || '?'

  function isActive(to) {
    // /settings (System Settings) must not light up for its siblings like /settings/shipping.
    if (to === '/settings') return location.pathname === '/settings'
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  useEffect(() => { setMobileNavOpen(false); setBlocked('') }, [location.pathname])

  // The API refused a change because the role only has view access (see api/client.js).
  useEffect(() => {
    const onBlocked = () => setBlocked('1')
    window.addEventListener('readonly-blocked', onBlocked)
    return () => window.removeEventListener('readonly-blocked', onBlocked)
  }, [])

  const isSectionOpen = (id, fallback) => (id in openSections ? !!openSections[id] : fallback)

  function setSection(id, open) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: open }
      try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Open the section(s) holding the current page after navigation.
  useEffect(() => {
    for (const group of navGroups) {
      for (const sg of group.subgroups || []) {
        if (sg.items.some((i) => isActive(i.to))) {
          setOpenSections((prev) => (prev[groupId(group)] && prev[subgroupId(group, sg)] ? prev : { ...prev, [groupId(group)]: true, [subgroupId(group, sg)]: true }))
        }
      }
      if (group.items.some((i) => VISIBLE_TAB_KEYS.has(i.key) && isActive(i.to))) {
        setOpenSections((prev) => (prev[groupId(group)] ? prev : { ...prev, [groupId(group)]: true }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  function renderItem(item, indent = false) {
    const ItemIcon = item.icon
    return (
      <Link
        key={item.to + item.key}
        to={item.to}
        title={t(`nav.items.${item.key}`)}
        className={`flex items-center gap-2 ${indent ? 'pl-6 pr-3' : 'px-3'} py-1.5 rounded-lg text-sm ${
          item.upcoming
            ? 'font-bold text-gray-400 hover:bg-gray-100'
            : isActive(item.to) ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        {ItemIcon && <ItemIcon width={15} height={15} className="shrink-0" />}
        <span className="truncate">{t(`nav.items.${item.key}`)}</span>
        {item.upcoming && (
          <span className="ml-auto shrink-0 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
            {t('common.upcoming')}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="h-screen overflow-hidden flex bg-gray-50">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[48] bg-black/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-extrabold text-lg">{shopName.charAt(0).toUpperCase()}</div>
          <span className="font-extrabold text-gray-800 tracking-tight">{shopName}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          <div className="space-y-0.5">
            {TOP_ITEMS.filter((item) => canSeeTab(item.key)).map((item) => {
              const ItemIcon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive(item.to) ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <ItemIcon width={18} height={18} className="shrink-0" /> <span className="truncate">{t(`nav.items.${item.key}`)}</span>
                </Link>
              )
            })}
          </div>

          {navGroups.map((group) => {
            const GroupIcon = group.icon
            const visible = (list) => list.filter((item) => VISIBLE_TAB_KEYS.has(item.key) && canSeeTab(item.key))
            const visibleItems = visible(group.items)
            const visibleSubs = (group.subgroups || [])
              .map((sg) => ({ sg, items: visible(sg.items) }))
              .filter((x) => x.items.length > 0)
            if (visibleItems.length === 0 && visibleSubs.length === 0) return null
            const open = isSectionOpen(groupId(group), group.title !== 'settings')
            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => setSection(groupId(group), !open)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-1.5 px-3 mb-1 text-[10px] font-bold text-gray-400 tracking-wider hover:text-gray-600"
                >
                  <GroupIcon width={13} height={13} /> {t(`nav.groups.${group.title}`)}
                  <IconChevronDown width={12} height={12} className={`ml-auto shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
                {open && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => renderItem(item))}
                    {visibleSubs.map(({ sg, items }) => {
                      const sid = subgroupId(group, sg)
                      const subOpen = isSectionOpen(sid, false)
                      return (
                        <div key={sid} className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => setSection(sid, !subOpen)}
                            aria-expanded={subOpen}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100"
                          >
                            <span className="truncate">{t(`nav.groups.${sg.title}`)}</span>
                            <IconChevronDown width={12} height={12} className={`ml-auto shrink-0 transition-transform ${subOpen ? '' : '-rotate-90'}`} />
                          </button>
                          {subOpen && <div className="space-y-0.5">{items.map((item) => renderItem(item, true))}</div>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

        </nav>

        <div className="p-3 border-t border-gray-200 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-red-600"
          >
            <IconLogout width={16} height={16} /> {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 sticky top-0 z-[45] bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden shrink-0 text-gray-500 hover:text-gray-800 p-1"
              aria-label="Buka menu"
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-extrabold text-gray-800 truncate">{pageTitle(location.pathname, t)}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-gray-500 tabular-nums">
              <span className="font-semibold text-gray-600">{t('shared.timezone_label')}</span> · <JakartaClock />
            </span>
            <button title={t('nav.items.notifications')} className="text-gray-400 hover:text-gray-600 relative">
              <IconBell />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                  {initial}
                </div>
                <span className="text-sm font-semibold text-gray-700 hidden sm:inline">{user?.name}</span>
                <IconChevronDown width={14} height={14} className="text-gray-400 hidden sm:inline" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-56 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5">
                    <button
                      onClick={() => { setPrefsOpen(true); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <IconSliders width={15} height={15} /> {t('preferences.title')}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      <IconLogout width={15} height={15} /> {t('common.logout')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto">
          {pageLevel === 'view' && (
            <div role="status" className="mx-3 mt-3 sm:mx-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              {t('shared.view_only_banner')}
            </div>
          )}
          {blocked && (
            <div role="alert" className="mx-3 mt-3 sm:mx-6 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
              <span>{t('shared.view_only_blocked')}</span>
              <button type="button" onClick={() => setBlocked('')} className="text-red-500 hover:text-red-700" aria-label={t('common.close')}>✕</button>
            </div>
          )}
          {/* the boundary sits INSIDE the shell: opening a not-yet-loaded page keeps the sidebar and header */}
          <Suspense fallback={<div className="p-10 text-center text-sm text-gray-400">{t('common.loading')}</div>}>
            {lock ? <EditLock>{children}</EditLock> : children}
          </Suspense>
        </main>
      </div>

      {prefsOpen && <PreferencesModal onClose={() => setPrefsOpen(false)} />}
    </div>
  )
}
