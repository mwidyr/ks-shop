import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  IconDashboard, IconOrders, IconProducts, IconSettings, IconLogout, IconBell,
  IconTag, IconTruck, IconMegaphone, IconChartLine, IconWallet, IconStore, IconGear,
} from './icons'

const navGroups = [
  {
    title: 'SALES', icon: IconTag, items: [
      { to: '/orders', label: 'Orders' },
      { to: '/customers', label: 'Customers' },
      { to: '/chat', label: 'Chat' },
      { to: '/reviews', label: 'Reviews' },
    ],
  },
  {
    title: 'CATALOG', icon: IconProducts, items: [
      { to: '/products', label: 'Products' },
      { to: '/categories', label: 'Categories' },
      { to: '/inventory', label: 'Inventory' },
      { to: '/warehouses', label: 'Warehouses' },
    ],
  },
  {
    title: 'FULFILLMENT', icon: IconTruck, items: [
      { to: '/shipping', label: 'Shipping' },
      { to: '/returns', label: 'Returns' },
      { to: '/refunds', label: 'Refunds' },
    ],
  },
  {
    title: 'MARKETING', icon: IconMegaphone, items: [
      { to: '/promotions', label: 'Promotions' },
      { to: '/campaigns', label: 'Campaigns' },
      { to: '/advertising', label: 'Advertising' },
    ],
  },
  {
    title: 'ANALYTICS', icon: IconChartLine, items: [
      { to: '/analytics/sales', label: 'Sales' },
      { to: '/analytics/products', label: 'Products' },
      { to: '/customers', label: 'Customers' },
      { to: '/profit', label: 'Profit' },
      { to: '/advertising', label: 'Advertising' },
    ],
  },
  {
    title: 'FINANCE', icon: IconWallet, items: [
      { to: '/finance/transactions', label: 'Transactions' },
      { to: '/finance/payouts', label: 'Payouts' },
      { to: '/finance/fees', label: 'Fees' },
      { to: '/finance/reports', label: 'Reports' },
    ],
  },
  {
    title: 'STORE', icon: IconStore, items: [
      { to: '/store/profile', label: 'Store Profile' },
      { to: '/store/design', label: 'Store Design' },
      { to: '/store/team', label: 'Team' },
    ],
  },
  {
    title: 'SYSTEM', icon: IconGear, items: [
      { to: '/system/notifications', label: 'Notifications' },
      { to: '/system/integrations', label: 'Integrations' },
      { to: '/system/roles', label: 'Roles & Permissions' },
      { to: '/system/audit-logs', label: 'Audit Logs' },
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

function buildTitleMap() {
  const map = [...titleOverrides]
  for (const group of navGroups) {
    for (const item of group.items) {
      map.push({ prefix: item.to, title: item.label })
    }
  }
  return map
}
const titleMap = buildTitleMap()

function pageTitle(pathname) {
  const match = titleMap.find((t) => pathname.startsWith(t.prefix))
  return match ? match.title : 'KS Shop'
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

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
          <span className="font-extrabold text-gray-800 tracking-tight">KS<span className="text-brand-600">Shop</span></span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          <Link
            to="/dashboard"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
              isActive('/dashboard') ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <IconDashboard width={18} height={18} /> Dashboard
          </Link>

          {navGroups.map((group) => {
            const GroupIcon = group.icon
            return (
              <div key={group.title}>
                <div className="flex items-center gap-1.5 px-3 mb-1 text-[10px] font-bold text-gray-400 tracking-wider">
                  <GroupIcon width={13} height={13} /> {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.to + item.label}
                      to={item.to}
                      className={`block px-3 py-1.5 rounded-lg text-sm ${
                        isActive(item.to) ? 'bg-brand-50 text-brand-600 font-semibold' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}

          <div>
            <Link
              to="/settings"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                isActive('/settings') ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <IconSettings width={16} height={16} /> Pengaturan
            </Link>
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-red-600"
          >
            <IconLogout width={16} height={16} /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-xl font-extrabold text-gray-800">{pageTitle(location.pathname)}</h1>
          <div className="flex items-center gap-4">
            <button title="Notifikasi" className="text-gray-400 hover:text-gray-600 relative">
              <IconBell />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                {initial}
              </div>
              <span className="text-sm font-semibold text-gray-700 hidden sm:inline">{user?.name}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
