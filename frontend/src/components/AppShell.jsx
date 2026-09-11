import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import PreferencesModal from './PreferencesModal'
import {
  IconDashboard, IconOrders, IconProducts, IconSettings, IconLogout, IconBell,
  IconTag, IconTruck, IconMegaphone, IconChartLine, IconWallet, IconStore, IconGear,
  IconSliders, IconChevronDown, IconStar, IconSend, IconSparkles, IconUser,
  IconBroadcast, IconUsers, IconChat, IconWarehouse, IconClipboard,
  IconUndo, IconBarChart, IconUserCog, IconPuzzle, IconFileText, IconPalette,
  IconCart, IconMolecule, IconTrendUp, IconLink,
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
      { to: '/chat', key: 'chat', icon: IconChat },
      { to: '/customers', key: 'customers', icon: IconUsers },
      { to: '/reviews', key: 'reviews', icon: IconStar },
    ],
  },
  {
    title: 'catalog', icon: IconProducts, items: [
      { to: '/products', key: 'products', icon: IconProducts },
      { to: '/categories', key: 'categories', icon: IconTag },
      { to: '/inventory', key: 'inventory', icon: IconMolecule },
      { to: '/warehouses', key: 'warehouses', icon: IconWarehouse },
    ],
  },
  {
    title: 'fulfillment', icon: IconTruck, items: [
      { to: '/returns', key: 'returns', icon: IconUndo },
      { to: '/refunds', key: 'refunds', icon: IconWallet },
    ],
  },
  {
    title: 'marketing', icon: IconMegaphone, items: [
      { to: '/promotions', key: 'promotions', icon: IconMegaphone },
      { to: '/campaigns', key: 'campaigns', icon: IconSparkles },
      { to: '/advertising', key: 'advertising', icon: IconSend },
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
      { to: '/finance/transactions', key: 'transactions', icon: IconWallet },
      { to: '/finance/payouts', key: 'payouts', icon: IconWallet },
      { to: '/finance/fees', key: 'fees', icon: IconWallet },
      { to: '/finance/reports', key: 'reports', icon: IconBarChart },
    ],
  },
  {
    title: 'store', icon: IconStore, items: [
      { to: '/store/profile', key: 'store_profile', icon: IconStore },
      { to: '/settings/shipping', key: 'shipping_settings', icon: IconLink },
      { to: '/hosts', key: 'hosts', icon: IconUser },
      { to: '/store/design', key: 'store_design', icon: IconPalette },
      { to: '/store/team', key: 'team', icon: IconUsers },
    ],
  },
  {
    title: 'system', icon: IconGear, items: [
      { to: '/system/notifications', key: 'notifications', icon: IconBell },
      { to: '/system/integrations', key: 'integrations', icon: IconPuzzle },
      { to: '/system/roles', key: 'roles', icon: IconUserCog },
      { to: '/system/audit-logs', key: 'audit_logs', icon: IconFileText },
    ],
  },
]

// Title lookup: built from the nav itself, plus overrides for routes that aren't
// literal nav destinations (detail/create/edit/print pages).
const titleOverrides = [
  { prefix: '/orders/new', title: 'Buat Order Baru' },
  { prefix: '/orders/print', title: 'Cetak Order' },
  { prefix: '/orders/', title: 'Detail Order' },
  { prefix: '/products/new', title: 'Tambah Produk' },
  { prefix: '/products/', title: 'Edit Produk' },
  { prefix: '/settings', title: 'Pengaturan' },
  { prefix: '/dashboard', title: 'Dashboard' },
]

function buildTitleMap(t) {
  const map = [...titleOverrides]
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

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initial = user?.name?.charAt(0)?.toUpperCase() || '?'

  function isActive(to) {
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
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
            return (
              <div key={group.title}>
                <div className="flex items-center gap-1.5 px-3 mb-1 text-[10px] font-bold text-gray-400 tracking-wider">
                  <GroupIcon width={13} height={13} /> {t(`nav.groups.${group.title}`)}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon
                    return (
                      <Link
                        key={item.to + item.key}
                        to={item.to}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                          isActive(item.to) ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {ItemIcon && <ItemIcon width={15} height={15} className="shrink-0" />}
                        <span className="truncate">{t(`nav.items.${item.key}`)}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}

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
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-xl font-extrabold text-gray-800">{pageTitle(location.pathname, t)}</h1>
          <div className="flex items-center gap-4">
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
