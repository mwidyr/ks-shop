// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({
  listPromotionPurposes: vi.fn(), createPromotionPurpose: vi.fn(() => Promise.resolve({})),
  updatePromotionPurpose: vi.fn(() => Promise.resolve({})), reorderPromotionPurposes: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../api/promotions', () => api)
vi.mock('../context/AccessContext', () => ({ useCanEdit: () => true }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import PromotionPurposesPanel from './PromotionPurposesPanel'

const rows = [
  { id: 1, name: 'General Promotion', sort_order: 1, is_active: true, is_system: true, usage_count: 5 },
  { id: 2, name: 'Customer Compensation', sort_order: 2, is_active: true, is_system: false, usage_count: 2 },
  { id: 3, name: 'Other', sort_order: 3, is_active: false, is_system: false, usage_count: 0 },
]

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<PromotionPurposesPanel />) })
  await act(async () => { await Promise.resolve() })
  return el
}
const setValue = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('PromotionPurposesPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); api.listPromotionPurposes.mockResolvedValue(rows) })

  it('lists the purposes and never lets the default one be disabled', async () => {
    const el = await mount()
    const names = [...el.querySelectorAll('input[type=text], input:not([type])')].map((i) => i.value).filter((v) => rows.some((r) => r.name === v))
    expect(names).toEqual(['General Promotion', 'Customer Compensation', 'Other'])
    const boxes = el.querySelectorAll('input[type=checkbox]')
    expect(boxes[0].disabled).toBe(true) // system purpose
    expect(boxes[1].disabled).toBe(false)
    expect(boxes[2].checked).toBe(false) // disabled one
  })

  it('renames on blur, disables, reorders and adds', async () => {
    const el = await mount()
    const inputs = [...el.querySelectorAll('input')].filter((i) => i.type !== 'checkbox')
    await setValue(inputs[1], 'Compensation')
    await act(async () => { inputs[1].dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(api.updatePromotionPurpose).toHaveBeenCalledWith(2, { name: 'Compensation' })

    await act(async () => { el.querySelectorAll('input[type=checkbox]')[1].click() })
    expect(api.updatePromotionPurpose).toHaveBeenCalledWith(2, { is_active: false })

    const downs = [...el.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === 'page_promotions.purposes_down')
    await act(async () => { downs[0].click() })
    expect(api.reorderPromotionPurposes).toHaveBeenCalledWith([2, 1, 3])

    const newInput = [...el.querySelectorAll('input')].find((i) => i.placeholder === 'page_promotions.purposes_new_placeholder')
    await setValue(newInput, 'Goodwill')
    await act(async () => { el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(api.createPromotionPurpose).toHaveBeenCalledWith('Goodwill')
  })
})
