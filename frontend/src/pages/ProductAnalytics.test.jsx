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
  const state = [{ from: '2026-01-01', to: '2026-01-31' }, () => {}] // stable identity
  return { default: () => null, useSharedRange: () => state }
})
vi.mock('../components/SalesChannelFilter', () => ({ default: () => null }))
vi.mock('../context/MasterDataContext', () => ({
  useMasterData: () => ({ translateColor: (c) => c, translateCategory: (c) => c }),
}))

const row = (id, sku, qty, gmv, colors = []) => ({
  product_id: id, sku, category: 'c', product_name: `P${id}`, qty, gmv, gmv_pct: 1, colors,
})
// Two products deliberately share the code "-" (the old sku key would collide).
const gmvList = [row(1, '-', 5, 900, [{ color: 'red', qty: 5, pct: 100 }]), row(2, '-', 50, 800), row(3, 'A3', 1, 700)]
const qtyList = [row(2, '-', 50, 800), row(1, '-', 5, 900, [{ color: 'red', qty: 5, pct: 100 }]), row(4, 'A4', 20, 10)]

vi.mock('../api/reports', () => ({
  getProductAnalysis: vi.fn(() => Promise.resolve({
    summary: { qty: 1, gmv: 1, orders: 1 },
    by_product: gmvList, by_product_gmv: gmvList, by_product_qty: qtyList, by_variant: [], by_category: [],
  })),
}))

import ProductAnalytics from './ProductAnalytics'

describe('ProductAnalytics ranking', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('swaps lists on sort toggle with stable rows, no key warnings, independent expansion', async () => {
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<ProductAnalytics />) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const rows = () => container.querySelectorAll('tbody tr.cursor-pointer').length
    const has = (txt) => container.textContent.includes(txt)
    const count = (txt) => container.textContent.split(txt).length - 1
    const btn = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label))
    const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(rows()).toBe(3)
    const p1 = [...container.querySelectorAll('tbody tr.cursor-pointer')].find((r) => r.textContent.includes('P1'))
    await click(p1) // expand only product 1
    expect(count('red')).toBe(1)

    for (let i = 0; i < 50; i++) {
      await click(btn('sort_by_qty'))
      expect(rows()).toBe(3)
      expect(has('P4')).toBe(true)
      await click(btn('sort_by_gmv'))
      expect(rows()).toBe(3)
      expect(has('P4')).toBe(false)
    }
    expect(count('red')).toBe(1)
    expect(console.error.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
  })
})
