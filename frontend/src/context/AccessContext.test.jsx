// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { tabLevel } from './AccessContext'
import { matrixGroups, tabForPath, navGroups, TOP_ITEMS, VISIBLE_TAB_KEYS, SUPER_ONLY_TABS, groupItems } from '../components/navConfig'

describe('tabLevel', () => {
  const view = { loaded: true, isSuperUser: false, access: { orders: 'view', products: 'edit' } }
  it('super user and loading state are never locked', () => {
    expect(tabLevel({ loaded: true, isSuperUser: true, access: {} }, 'orders')).toBe('edit')
    expect(tabLevel({ loaded: false, isSuperUser: false, access: null }, 'orders')).toBe('edit')
  })
  it('reads the role level, no row = none', () => {
    expect(tabLevel(view, 'orders')).toBe('view')
    expect(tabLevel(view, 'products')).toBe('edit')
    expect(tabLevel(view, 'inventory')).toBe('none')
  })
  it('pages outside the nav are not locked', () => {
    expect(tabLevel(view, null)).toBe('edit')
  })
})

describe('tabForPath', () => {
  it.each([
    ['/orders', 'orders'], ['/orders/123', 'orders'], ['/orders/new', 'orders'], ['/products/5/edit', 'products'],
    ['/shipping-workbench/711/batches/3', 'shipping_workbench'], ['/settings', 'settings'], ['/settings/shipping', 'shipping_settings'],
    ['/store/profile', 'store_profile'], ['/purchases/history', 'purchases'], ['/website/requests', 'orders'],
    ['/system/roles', 'roles'], ['/analytics/performance-dashboard', 'performance_dashboard'], ['/panel-siaran/9', 'panel_siaran'],
  ])('%s -> %s', (path, tab) => expect(tabForPath(path)).toBe(tab))
  it('an unknown page has no tab', () => expect(tabForPath('/nowhere')).toBe(null))
})

describe('permission matrix list', () => {
  const tabs = matrixGroups().flatMap((g) => g.tabs)
  it('has exactly the tabs the sidebar shows', () => {
    const sidebar = [...TOP_ITEMS, ...navGroups.flatMap(groupItems)].map((i) => i.key).filter((k) => VISIBLE_TAB_KEYS.has(k))
    const expected = sidebar.filter((k) => !SUPER_ONLY_TABS.has(k) && k !== 'website_requests')
    expect([...tabs].sort()).toEqual([...expected].sort())
  })
  it('no longer lists features that were removed from the sidebar', () => {
    for (const gone of ['chat', 'reviews', 'warehouses', 'refunds', 'shipping', 'transactions', 'payouts', 'fees', 'campaigns', 'advertising',
      'store_design', 'team', 'notifications', 'integrations', 'purchase_alert', 'dashboard', 'sales_analytics', 'picking']) {
      expect(tabs).not.toContain(gone)
    }
  })
  it('keeps the sidebar order and groups, without duplicates', () => {
    expect(new Set(tabs).size).toBe(tabs.length)
    expect(matrixGroups().map((g) => g.titleKey)[0]).toBe('page_roles.group_general')
    expect(tabs.indexOf('orders')).toBeLessThan(tabs.indexOf('products'))
    expect(tabs).toContain('shipping_workbench')
  })
})
