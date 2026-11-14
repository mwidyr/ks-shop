// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ getPromotionUsage: vi.fn(), listPromotionPurposes: vi.fn(), listPromotions: vi.fn() }))
vi.mock('../api/promotions', () => api)
vi.mock('../api/hosts', () => ({ listHosts: () => Promise.resolve([]) }))
vi.mock('../api/hostLocations', () => ({ listLocations: () => Promise.resolve([]) }))
// the range must be the same object on every render, like the real shared range state
const shared = vi.hoisted(() => ({ range: { from: '2026-11-01', to: '2026-11-14' }, set: () => {} }))
vi.mock('./PeriodPicker', () => ({ default: () => null, useSharedRange: () => [shared.range, shared.set] }))
vi.mock('./SalesChannelFilter', () => ({ default: ({ onChannelChange }) => <button data-testid="live" onClick={() => onChannelChange('live')}>live</button> }))
const copy = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
vi.mock('../utils/clipboard', () => ({ copyToClipboard: copy }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import PromotionUsageHistory from './PromotionUsageHistory'

const data = {
  summary: { issued: 100, used: 80, uses: 2, cancelled_uses: 1, gmv: 320 },
  total: 2, staff: [{ id: 5, name: 'Nick' }],
  rows: [
    { id: 1, ordered_at: '2026-11-12T03:00:00Z', order_id: 10, order_no: 'ORD-1', sales_channel: 'website', promotion: 'Sorry gift', code: '', amount: 50, purpose: 'Customer Compensation', applied_by: 'Nick', customer_phone: '0912345678', gmv: 150, cancelled: false, hosts: '' },
    { id: 2, ordered_at: '2026-11-12T04:00:00Z', order_id: 11, order_no: 'ORD-2', sales_channel: 'live', promotion: 'Sorry gift', code: '', amount: 20, purpose: 'Goodwill', applied_by: 'Nick', customer_phone: '0987654321', gmv: 180, cancelled: true, hosts: 'Rani' },
  ],
}

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter><PromotionUsageHistory /></MemoryRouter>) })
  await act(async () => { await Promise.resolve() })
  return el
}

describe('PromotionUsageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getPromotionUsage.mockImplementation(() => Promise.resolve(data))
    api.listPromotionPurposes.mockImplementation(() => Promise.resolve([{ id: 2, name: 'Customer Compensation', is_active: true }]))
    api.listPromotions.mockImplementation(() => Promise.resolve([{ id: 9, name: 'Sorry gift', code: '' }]))
  })

  it('shows the summary, marks cancelled orders and copies a phone number with one click', async () => {
    const el = await mount()
    expect(api.getPromotionUsage).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-11-01', to: '2026-11-14', page: 1 }))
    expect(el.textContent).toContain('100') // issued
    expect(el.textContent).toContain('80')  // used
    expect(el.textContent).toContain('ORD-1')
    const rowsText = [...el.querySelectorAll('tbody tr')].map((r) => r.textContent)
    expect(rowsText[1]).toContain('page_promotions.usage_cancelled')
    expect(rowsText[0]).not.toContain('page_promotions.usage_cancelled')
    const copyButtons = [...el.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') || '').startsWith('page_orders.copy_phone_aria'))
    await act(async () => { copyButtons[0].click() })
    expect(copy).toHaveBeenCalledWith('0912345678')
  })

  it('sends the chosen filters to the server and starts again from page 1', async () => {
    const el = await mount()
    const selects = el.querySelectorAll('select')
    await act(async () => {
      selects[1].value = '2'; selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(api.getPromotionUsage).toHaveBeenLastCalledWith(expect.objectContaining({ purpose_id: '2', page: 1 }))
    await act(async () => { el.querySelector('[data-testid="live"]').click() })
    expect(api.getPromotionUsage).toHaveBeenLastCalledWith(expect.objectContaining({ sales_channel: 'live' }))
  })
})
