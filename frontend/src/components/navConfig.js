import {
  IconDashboard, IconOrders, IconProducts, IconSettings, IconLogout, IconBell,
  IconTag, IconTruck, IconMegaphone, IconChartLine, IconWallet, IconStore, IconGear,
  IconSliders, IconChevronDown, IconStar, IconSend, IconSparkles, IconUser,
  IconBroadcast, IconUsers, IconChat, IconWarehouse, IconClipboard,
  IconUndo, IconBarChart, IconUserCog, IconPuzzle, IconFileText, IconPalette,
  IconCart, IconMolecule, IconTrendUp, IconLink, IconChecklist, IconBook,
} from './icons'

// Sidebar structure per the client's "Sidebar Structure & Navigation Adjustments": two ungrouped
// top items (Performance Dashboard, LIVE Data Portal - see TOP_ITEMS) followed by these sections.
// Items that are not shipped yet stay listed here (marked `upcoming`) but are hidden by
// VISIBLE_TAB_KEYS below.
export const navGroups = [
  {
    title: 'operations', icon: IconCart, items: [
      { to: '/orders', key: 'orders', icon: IconCart },
      { to: '/shipping-workbench', key: 'shipping_workbench', icon: IconClipboard },
      { to: '/returns', key: 'returns', icon: IconUndo },
      { to: '/inventory', key: 'inventory', icon: IconMolecule },
      { to: '/customers', key: 'customers', icon: IconUsers },
      { to: '/shipping', key: 'shipping', icon: IconTruck },
      { to: '/refunds', key: 'refunds', icon: IconWallet },
      { to: '/chat', key: 'chat', icon: IconChat, upcoming: true },
      { to: '/reviews', key: 'reviews', icon: IconStar, upcoming: true },
      { to: '/warehouses', key: 'warehouses', icon: IconWarehouse, upcoming: true },
    ],
  },
  {
    title: 'catalog', icon: IconProducts, items: [
      { to: '/products', key: 'products', icon: IconProducts },
      { to: '/categories', key: 'categories', icon: IconTag },
      { to: '/colors', key: 'colors', icon: IconPalette },
    ],
  },
  {
    title: 'sales_insights', icon: IconChartLine, items: [
      { to: '/analytics/heatmap', key: 'heatmap', icon: IconTrendUp },
      { to: '/analytics/performance-comparison', key: 'performance_comparison', icon: IconTrendUp },
      { to: '/analytics/host-performance', key: 'host_performance_analytics', icon: IconTrendUp },
      { to: '/analytics/sales', key: 'sales_analytics', icon: IconTrendUp },
      { to: '/analytics/website', key: 'website_analytics', icon: IconChartLine },
    ],
  },
  {
    title: 'product_performance', icon: IconTrendUp, items: [
      { to: '/analytics/host-category-leaderboard', key: 'host_category_leaderboard', icon: IconTrendUp },
      { to: '/analytics/products', key: 'product_analytics', icon: IconTrendUp },
      { to: '/analytics/product-trend', key: 'product_trend', icon: IconTrendUp },
      { to: '/analytics/product-performance', key: 'product_performance', icon: IconTrendUp },
      { to: '/analytics/product-color-pair', key: 'product_color_pair', icon: IconTrendUp },
    ],
  },
  {
    title: 'website', icon: IconPalette, items: [
      { to: '/website/home', key: 'website_home', icon: IconSliders },
      { to: '/website/categories-layout', key: 'website_categories', icon: IconTag },
      { to: '/website/hosts', key: 'website_hosts', icon: IconUser },
      { to: '/website/live', key: 'website_live', icon: IconBroadcast },
      { to: '/website/content', key: 'website_content', icon: IconBook },
      { to: '/website/theme', key: 'theme', icon: IconPalette },
      { to: '/website/members', key: 'members', icon: IconUsers },
      { to: '/website/requests', key: 'website_requests', icon: IconChat },
    ],
  },
  {
    title: 'procurement', icon: IconTruck, items: [
      { to: '/suppliers', key: 'suppliers', icon: IconTruck },
      { to: '/purchases', key: 'purchases', icon: IconClipboard },
      { to: '/purchase-requisitions', key: 'purchase_requisitions', icon: IconClipboard },
      { to: '/replenishment-planning', key: 'replenishment_planning', icon: IconChecklist },
      { to: '/opening-inventory', key: 'opening_inventory', icon: IconChecklist },
    ],
  },
  {
    title: 'finance', icon: IconWallet, items: [
      { to: '/profit', key: 'profit', icon: IconWallet },
      { to: '/finance/reports', key: 'reports', icon: IconBarChart },
      { to: '/finance/transactions', key: 'transactions', icon: IconWallet, upcoming: true },
      { to: '/finance/payouts', key: 'payouts', icon: IconWallet, upcoming: true },
      { to: '/finance/fees', key: 'fees', icon: IconWallet, upcoming: true },
    ],
  },
  {
    // Two-level group: Settings -> subcategory -> pages (per the client's nested-menu spec).
    title: 'settings', icon: IconGear, items: [
      { to: '/campaigns', key: 'campaigns', icon: IconSparkles, upcoming: true },
      { to: '/advertising', key: 'advertising', icon: IconSend, upcoming: true },
      { to: '/store/design', key: 'store_design', icon: IconPalette, upcoming: true },
      { to: '/store/team', key: 'team', icon: IconUsers, upcoming: true },
      { to: '/system/notifications', key: 'notifications', icon: IconBell, upcoming: true },
      { to: '/system/integrations', key: 'integrations', icon: IconPuzzle, upcoming: true },
    ],
    subgroups: [
      {
        title: 'business_settings', items: [
          { to: '/promotions', key: 'promotions', icon: IconMegaphone },
          { to: '/store/profile', key: 'store_profile', icon: IconStore },
          { to: '/settings/shipping', key: 'shipping_settings', icon: IconLink },
        ],
      },
      {
        title: 'people_access', items: [
          { to: '/hosts', key: 'hosts', icon: IconUser },
          { to: '/affiliates', key: 'affiliates', icon: IconUser },
          { to: '/system/roles', key: 'roles', icon: IconUserCog },
        ],
      },
      {
        title: 'notifications', items: [
          { to: '/settings/telegram', key: 'telegram_settings', icon: IconSend },
        ],
      },
      {
        title: 'system_logs', items: [
          { to: '/system/audit-logs', key: 'audit_logs', icon: IconFileText },
          { to: '/settings', key: 'settings', icon: IconSettings },
        ],
      },
    ],
  },
]

// The two items at the very top of the sidebar, without a section heading. The Performance
// Dashboard replaces the old Dashboard page (/dashboard now redirects to it).
export const TOP_ITEMS = [
  { to: '/analytics/performance-dashboard', key: 'performance_dashboard', icon: IconDashboard },
  { to: '/panel-siaran', key: 'panel_siaran', icon: IconBroadcast },
]

// Product decision: only these tabs are shown in the sidebar for now. Everything else stays
// fully implemented (routes, handlers, translations, navGroups entry) - just hidden from nav
// until it's ready to ship. This is a blanket visibility gate on top of (not a replacement
// for) the per-role canSeeTab() permission check below.
export const VISIBLE_TAB_KEYS = new Set([
  'panel_siaran', 'orders', 'shipping_workbench', 'products', 'categories', 'colors', 'inventory', 'customers', 'settings',
  'reports', 'product_analytics', 'product_trend', 'product_performance', 'product_color_pair', 'host_category_leaderboard', 'performance_dashboard',
  'host_performance_analytics', 'heatmap', 'performance_comparison', 'hosts', 'affiliates', 'returns',
  'suppliers', 'purchases', 'purchase_requisitions', 'replenishment_planning', 'opening_inventory',
  'store_profile', 'shipping_settings', 'roles', 'audit_logs', 'telegram_settings', 'profit', 'promotions',
  'website_analytics', 'website_home', 'website_categories', 'website_hosts', 'website_live', 'website_content', 'theme', 'website_requests', 'members',
])


// Every page entry of a group, including those inside its subgroups.
export const groupItems = (group) => [...group.items, ...(group.subgroups || []).flatMap((sg) => sg.items)]

// Tabs that follow another tab's access: restock / return requests follow Orders.
export const TAB_ALIAS = { website_requests: 'orders' }
// Tabs only the Super Admin sees (never a cell of the permission matrix).
export const SUPER_ONLY_TABS = new Set(['telegram_settings', 'opening_inventory'])

// The permission matrix lists exactly what the sidebar shows, in the sidebar's order and grouping:
// every visible tab of TOP_ITEMS and navGroups, minus the ones that are not matrix cells.
// (Tabs that exist in the backend but are hidden from the sidebar - chat, reviews, finance
// placeholders, ... - are not listed, so they cannot be given or taken away by mistake.)
export function matrixGroups() {
  const keep = (key) => VISIBLE_TAB_KEYS.has(key) && !SUPER_ONLY_TABS.has(key) && !TAB_ALIAS[key]
  const groups = [{ titleKey: 'page_roles.group_general', tabs: TOP_ITEMS.map((i) => i.key).filter(keep) }]
  for (const group of navGroups) {
    groups.push({ titleKey: `nav.groups.${group.title}`, tabs: groupItems(group).map((i) => i.key).filter(keep) })
  }
  return groups.filter((g) => g.tabs.length > 0)
}

// The tab a URL belongs to (longest matching sidebar link), or null for pages outside the nav.
// /orders/123, /products/5/edit, /purchases/history ... all resolve to their section.
export function tabForPath(pathname) {
  const items = [...TOP_ITEMS, ...navGroups.flatMap(groupItems)]
  let best = null
  for (const item of items) {
    const hit = item.to === '/settings' ? pathname === '/settings' : (pathname === item.to || pathname.startsWith(`${item.to}/`))
    if (hit && (!best || item.to.length > best.to.length)) best = item
  }
  return best ? (TAB_ALIAS[best.key] || best.key) : null
}
