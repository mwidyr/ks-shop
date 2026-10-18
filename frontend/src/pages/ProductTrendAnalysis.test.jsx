// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
vi.mock('../api/hosts', () => ({ listHosts: () => Promise.resolve([]) }))
vi.mock('../api/hostLocations', () => ({ listLocations: () => Promise.resolve([]) }))
vi.mock('../api/affiliates', () => ({ listAffiliates: () => Promise.resolve([]) }))
vi.mock('../components/PeriodPicker', () => {
  const state = [{ from: '2026-01-01', to: '2026-01-31' }, () => {}]
  return { default: () => null, useSharedRange: () => state }
})
vi.mock('../components/SalesChannelFilter', () => ({ default: () => null }))
vi.mock('../context/MasterDataContext', () => ({
  useMasterData: () => ({ translateColor: (c) => c, translateCategory: (c) => c }),
}))

const e = (pq, cq) => ({ prev: { qty: pq, gmv: pq }, cur: { qty: cq, gmv: cq } })
const prod = (id, sku, pq, cq) => ({ product_id: id, sku, name: `N${sku}`, category: 'c', colors: [{ color: 'red', ...e(pq, cq) }], ...e(pq, cq) })

// The server decides the order; the page must render it untouched (deliberately not sorted by anything).
const items = [prod(3, 'Z9', 1, 1), prod(1, 'A1', 9, 9), prod(2, 'M5', 5, 5)]
let calls = []
vi.mock('../api/reports', () => ({
  getProductTrend: vi.fn((params) => {
    calls.push(params)
    return Promise.resolve({
      current: { from: 'a', to: 'b' }, previous: { from: 'c', to: 'd' },
      growth: [], decline: [], categories: [],
      products: { items, total: 120, page: params.page, page_size: params.page_size },
    })
  }),
}))

import ProductTrendAnalysis from './ProductTrendAnalysis'

describe('ProductTrendAnalysis', () => {
  beforeEach(() => { calls = []; vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('renders server order, sends metric/sort to the server and resets paging', async () => {
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<ProductTrendAnalysis />) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const order = () => [...container.querySelectorAll('tbody tr.cursor-pointer')].map((r) => r.textContent.slice(0, 2))
    expect(order()).toEqual(['Z9', 'A1', 'M5'])

    const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const btn = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

    await click([...container.querySelectorAll('button')].find((b) => b.textContent.includes('page_orders.next')))
    expect(calls.at(-1).page).toBe(2)

    for (let i = 0; i < 20; i++) {
      await click(btn('GMV')); await click(btn('QTY'))
    }
    expect(calls.at(-1).metric).toBe('qty')
    expect(calls.at(-1).page).toBe(1) // changing the metric went back to page 1
    expect(order()).toEqual(['Z9', 'A1', 'M5'])
    expect(console.error.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
  })
})
