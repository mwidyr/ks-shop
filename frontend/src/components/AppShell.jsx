import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { getMyAccess } from '../api/rolePermissions'
import PreferencesModal from './PreferencesModal'
import {
  IconDashboard, IconOrders, IconProducts, IconSettings, IconLogout, IconBell,
  IconTag, IconTruck, IconMegaphone, IconChartLine, IconWallet, IconStore, IconGear,
  IconSliders, IconChevronDown, IconStar, IconSend, IconSparkles, IconUser,
  IconBroadcast, IconUsers, IconChat, IconWarehouse, IconClipboard,
  IconUndo, IconBarChart, IconUserCog, IconPuzzle, IconFileText, IconPalette,
  IconCart, IconMolecule, IconTrendUp, IconLink, IconChecklist,
} from './icons'

// Grouped into our own 8-category taxonomy (kept by deliberate choice rather than the
// reference's flat list), but item names/icons and relative ordering within each group are
// matched to the reference wherever a direct feature equivalent exists.
const navGroups = [
  {
    title: 'sales', icon: IconTag, items: [
      { to: '/panel-siaran', key: 'panel_siaran', icon: IconBroadcast },
      { to: '/orders', key: 'orders', icon: IconCart },
      { to: '/picking', key: 'picking', icon: IconClipboard },
      { to: '/shipping', key: 'shipping', icon: IconTruck },
      { to: '/chat', key: 'chat', icon: IconChat, upcoming: true },
      { to: '/reviews', key: 'reviews', icon: IconStar, upcoming: true },
    ],
  },
  {
    title: 'catalog', icon: IconProducts, items: [
      { to: '/products', key: 'products', icon: IconProducts },
      { to: '/categories', key: 'categories', icon: IconTag },
      { to: '/inventory', key: 'inventory', icon: IconMolecule },
      { to: '/customers', key: 'customers', icon: IconUsers, upcoming: true },
      { to: '/warehouses', key: 'warehouses', icon: IconWarehouse, upcoming: true },
      { to: '/suppliers', key: 'suppliers', icon: IconTruck },
      { to: '/purchases', key: 'purchases', icon: IconClipboard },
      { to: '/purchase-alert', key: 'purchase_alert', icon: IconChecklist },
    ],
  },
  {
    title: 'marketing', icon: IconMegaphone, items: [
      { to: '/promotions', key: 'promotions', icon: IconMegaphone, upcoming: true },
      { to: '/campaigns', key: 'campaigns', icon: IconSparkles, upcoming: true },
      { to: '/advertising', key: 'advertising', icon: IconSend, upcoming: true },
    ],
  },
  {
    title: 'analytics', icon: IconChartLine, items: [
      { to: '/analytics/sales', key: 'sales_analytics', icon: IconTrendUp },
      { to: '/analytics/products', key: 'product_analytics', icon: IconTrendUp },
      { to: '/profit', key: 'profit', icon: IconWallet },
    ],
  },
  {
    title: 'finance', icon: IconWallet, items: [
      { to: '/finance/transactions', key: 'transactions', icon: IconWallet, upcoming: true },
      { to: '/finance/payouts', key: 'payouts', icon: IconWallet, upcoming: true },
      { to: '/finance/fees', key: 'fees', icon: IconWallet, upcoming: true },
      { to: '/finance/reports', key: 'reports', icon: IconBarChart },
    ],
  },
  {
    title: 'fulfillment', icon: IconTruck, items: [
      { to: '/returns', key: 'returns', icon: IconUndo },
      { to: '/refunds', key: 'refunds', icon: IconWallet, upcoming: true },
    ],
  },
  {
    title: 'store', icon: IconStore, items: [
      { to: '/store/profile', key: 'store_profile', icon: IconStore },
      { to: '/settings/shipping', key: 'shipping_settings', icon: IconLink },
      { to: '/hosts', key: 'hosts', icon: IconUser },
      { to: '/store/design', key: 'store_design', icon: IconPalette, upcoming: true },
      { to: '/store/team', key: 'team', icon: IconUsers, upcoming: true },
    ],
  },
  {
    title: 'system', icon: IconGear, items: [
      { to: '/system/notifications', key: 'notifications', icon: IconBell, upcoming: true },
      { to: '/system/integrations', key: 'integrations', icon: IconPuzzle, upcoming: true },
      { to: '/system/roles', key: 'roles', icon: IconUserCog },
      { to: '/system/audit-logs', key: 'audit_logs', icon: IconFileText },
    ],
  },
]

// Product decision: only these tabs are shown in the sidebar for now. Everything else stays
// fully implemented (routes, handlers, translations, navGroups entry) - just hidden from nav
// until it's ready to ship. This is a blanket visibility gate on top of (not a replacement
// for) the per-role canSeeTab() permission check below.
const VISIBLE_TAB_KEYS = new Set([
  'panel_siaran', 'orders', 'picking', 'shipping', 'products', 'inventory', 'customers',
  'reports', 'sales_analytics', 'product_analytics', 'profit', 'hosts', 'returns',
  'store_profile', 'shipping_settings', 'roles',
])

// Title lookup: built from the nav itself, plus overrides for routes that aren't
// literal nav destinations (detail/create/edit/print pages).
const titleOverrides = [
  { prefix: '/orders/new', titleKey: 'shared.title_new_order' },
  { prefix: '/orders/print', titleKey: 'shared.title_print_order' },
  { prefix: '/orders/', titleKey: 'shared.title_order_detail' },
  { prefix: '/products/new', titleKey: 'shared.title_new_product' },
  { prefix: '/products/', titleKey: 'shared.title_edit_product' },
  { prefix: '/settings', titleKey: 'shared.title_settings' },
  { prefix: '/dashboard', titleKey: 'shared.title_dashboard' },
  { prefix: '/panel-siaran/history', titleKey: 'shared.title_session_history' },
  { prefix: '/panel-siaran/new', titleKey: 'shared.title_new_session' },
  { prefix: '/panel-siaran/', titleKey: 'shared.title_manage_session' },
  { prefix: '/shipping/export', titleKey: 'shared.title_shipping_export' },
]

function buildTitleMap(t) {
  const map = titleOverrides.map((o) => ({ prefix: o.prefix, title: t(o.titleKey) }))
  for (const group of navGroups) {
    for (const item of group.items) {
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

export default function AppShell({ children }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [access, setAccess] = useState(null) // null = still loading (show everything to avoid flicker)
  const [isSuperUser, setIsSuperUser] = useState(true)

  useEffect(() => {
    getMyAccess().then((res) => {
      setIsSuperUser(res.role === 'super_user')
      setAccess(res.access)
    })
  }, [])

  // A tab is visible if it's super_user (always full access) or has any row (view/edit) - a
  // missing entry means "none". Still loading (access === null) shows everything to avoid a
  // flash of a mostly-empty sidebar before the real access map arrives.
  function canSeeTab(tabKey) {
    if (isSuperUser || access === null) return true
    return !!access[tabKey]
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initial = user?.name?.charAt(0)?.toUpperCase() || '?'

  function isActive(to) {
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  return (
    <div className="min-h-screen flex bg-gray-50">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-extrabold text-lg">K</div>
          <span className="font-extrabold text-gray-800 tracking-tight">{t('brand.name')}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          <Link
            to="/dashboard"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
              isActive('/dashboard') ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <IconDashboard width={18} height={18} /> {t('nav.dashboard')}
          </Link>

          {navGroups.map((group) => {
            const GroupIcon = group.icon
            const visibleItems = group.items.filter((item) => VISIBLE_TAB_KEYS.has(item.key) && canSeeTab(item.key))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.title}>
                <div className="flex items-center gap-1.5 px-3 mb-1 text-[10px] font-bold text-gray-400 tracking-wider">
                  <GroupIcon width={13} height={13} /> {t(`nav.groups.${group.title}`)}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const ItemIcon = item.icon
                    return (
                      <Link
                        key={item.to + item.key}
                        to={item.to}
                        title={t(`nav.items.${item.key}`)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
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
                  })}
                </div>
              </div>
            )
          })}

          {canSeeTab('settings') && (
            <div>
              <Link
                to="/settings"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                  isActive('/settings') ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <IconSettings width={16} height={16} /> {t('nav.settings')}
              </Link>
            </div>
          )}
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
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 gap-2">
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
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>

      {prefsOpen && <PreferencesModal onClose={() => setPrefsOpen(false)} />}
    </div>
  )
}
