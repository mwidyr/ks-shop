// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({
  getHomeBanners: vi.fn(), saveHomeBanners: vi.fn((l) => Promise.resolve(l)),
  getCategoryLayout: vi.fn(), saveCategoryLayout: vi.fn(), setCategoryCover: vi.fn(() => Promise.resolve({})),
}))
const ga = vi.hoisted(() => ({ getWebsiteAnalytics: vi.fn() }))
vi.mock('../api/website', () => api)
vi.mock('../api/websiteAnalytics', () => ga)
vi.mock('../utils/image', () => ({ resolveUrl: (u) => u, uploadImageFile: vi.fn(async () => '/uploads/new.png') }))
vi.mock('../context/MasterDataContext', () => ({ useMasterData: () => ({ translateCategory: (v) => v }) }))
vi.mock('../components/PeriodPicker', () => ({ default: () => null, useSharedRange: () => [{ from: '2026-10-01', to: '2026-10-07' }, () => {}] }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import HomeBanners from '../components/website/HomeBanners'
import WebsiteCategories, { slotPlacement } from './WebsiteCategories'
import WebsiteAnalytics from './WebsiteAnalytics'

async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(node) })
  await act(async () => { await Promise.resolve() })
  return el
}
const click = (b) => act(async () => { b.click() })

describe('HomeBanners', () => {
  beforeEach(() => { document.body.innerHTML = ''; Object.values(api).forEach((f) => f.mockClear?.()); api.getHomeBanners.mockResolvedValue([{ id: 1, image_url: '/uploads/a.jpg', link_url: '/p/1', alt: '', is_active: true }]) })

  it('uploads a new banner, reorders and saves the whole list', async () => {
    const el = await mount(<HomeBanners />)
    const file = el.querySelector('[data-testid=banner-file]')
    Object.defineProperty(file, 'files', { value: [new File(['x'], 'b.png', { type: 'image/png' })] })
    await act(async () => { file.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(el.querySelectorAll('img')).toHaveLength(2)
    await click(el.querySelectorAll('button[aria-label="page_website.common.up"]')[1])
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('banners.save')))
    expect(api.saveHomeBanners).toHaveBeenCalledWith([
      { image_url: '/uploads/new.png', link_url: '', alt: '', is_active: true },
      { image_url: '/uploads/a.jpg', link_url: '/p/1', alt: '', is_active: true },
    ])
  })

  it('deletes a banner', async () => {
    const el = await mount(<HomeBanners />)
    await click(el.querySelector('button[aria-label="page_website.banners.delete"]'))
    expect(el.querySelectorAll('img')).toHaveLength(0)
  })
})

describe('WebsiteCategories', () => {
  const cats = [{ id: 1, name: 'Tops', cover_url: '', count: 2 }, { id: 2, name: 'Shoes', cover_url: '/uploads/s.jpg', count: 1 }]
  beforeEach(() => { document.body.innerHTML = ''; api.getCategoryLayout.mockResolvedValue({ sections: [{ template: 'large_left', slots: [1, 2, null, null, null] }], categories: cats }); api.saveCategoryLayout.mockClear(); api.saveCategoryLayout.mockImplementation((s) => Promise.resolve({ sections: s, categories: cats })) })

  it('places slots like the website: large card spans 2x2, the smalls fill the other half', () => {
    expect(slotPlacement('large_left', 0)).toEqual({ gridColumn: '1 / span 2', gridRow: '1 / span 2' })
    expect(slotPlacement('large_left', 4)).toEqual({ gridColumn: '4', gridRow: '2' })
    expect(slotPlacement('large_right', 0).gridColumn).toBe('3 / span 2')
    expect(slotPlacement('large_right', 1).gridColumn).toBe('1')
    expect(slotPlacement('all_small', 4)).toEqual({ gridColumn: '1', gridRow: '2' })
  })

  it('switches template, adds and deletes sections, saves', async () => {
    const el = await mount(<WebsiteCategories />)
    expect(el.querySelectorAll('[data-testid=layout-section]')).toHaveLength(1)
    await click(el.querySelectorAll('[role=tab]')[2]) // All Small
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('add_section')))
    expect(el.querySelectorAll('[data-testid=layout-section]')).toHaveLength(2)
    await click([...el.querySelectorAll('button')].filter((b) => b.textContent.includes('categories_layout.delete'))[1])
    expect(el.querySelectorAll('[data-testid=layout-section]')).toHaveLength(1)
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('common.publish')))
    expect(api.saveCategoryLayout).toHaveBeenCalledWith([{ template: 'all_small', slots: [1, 2, null, null, null] }])
  })

  it('uploads a category image and keeps the new url', async () => {
    const el = await mount(<WebsiteCategories />)
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('upload_image')))
    const file = el.querySelector('[data-testid=cover-file]')
    Object.defineProperty(file, 'files', { value: [new File(['x'], 'c.png', { type: 'image/png' })] })
    await act(async () => { file.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(api.setCategoryCover).toHaveBeenCalledWith(1, '/uploads/new.png')
  })
})

describe('WebsiteAnalytics', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  it('says it is not connected until GA4 is configured', async () => {
    ga.getWebsiteAnalytics.mockResolvedValue({ configured: false, sources: [], products: [], articles: [] })
    const el = await mount(<WebsiteAnalytics />)
    expect(el.querySelector('[data-testid=ga-not-connected]')).not.toBeNull()
    expect(el.querySelector('[data-testid=ga-kpis]')).toBeNull()
    expect(ga.getWebsiteAnalytics).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-07' })
  })
  it('shows traffic, products by code and articles', async () => {
    ga.getWebsiteAnalytics.mockResolvedValue({
      configured: true, overview: { users: 50, new_users: 20, sessions: 80, page_views: 300, avg_session_seconds: 95, engagement_rate: 0.62 },
      sources: [{ channel: 'Organic Search', sessions: 40, users: 30 }], products: [{ product_id: 1, code: 'C027', name: 'Dress', views: 15 }], articles: [{ slug: 'a', title: 'Artikel A', views: 6 }],
    })
    const el = await mount(<WebsiteAnalytics />)
    const text = el.textContent
    expect(text).toContain('1m 35s')
    expect(text).toContain('62.0%')
    expect(text).toContain('Organic Search')
    expect(text).toContain('C027')
    expect(text).toContain('Artikel A')
  })
})
