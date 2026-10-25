// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o && o.count !== undefined ? `${k}:${o.count}` : k) }) }))
const products = [{
  id: 1, sku: 'C002', name: 'Kaos Bahu Miring', names: {}, is_active: true, category: '', images: [], variants: [
    { id: 11, sku: 'C002-BLACK-L', color: 'Black', size: 'L', price: 190, total_stock: 5, is_active: true },
    { id: 12, sku: 'C002-WHITE-M', color: 'White', size: 'M', price: 190, total_stock: 3, is_active: true }] }]
vi.mock('../api/products', () => ({ listProducts: () => Promise.resolve(products) }))
vi.mock('../api/categories', () => ({ listCategories: () => Promise.resolve([]) }))

import ProductPickerModal from './ProductPickerModal'
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function mockViewport(mobile) {
  window.matchMedia = (query) => ({ matches: mobile && /max-width/.test(query), addEventListener() {}, removeEventListener() {} })
}
async function open(mobile) {
  mockViewport(mobile)
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  const onClose = vi.fn(); const onAdd = vi.fn()
  await act(async () => { root.render(<ProductPickerModal onClose={onClose} onAdd={onAdd} />) })
  await act(async () => {}) // products loaded
  return { el, root, onClose, onAdd }
}
const click = (node) => act(async () => { node.click() })
const plusFor = (el, n) => [...el.querySelectorAll('button')].filter((b) => b.textContent === '+')[n]

describe('ProductPickerModal on mobile', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.body.style.overflow = '' })

  it('is a full-screen view that a tap outside cannot close', async () => {
    const { el, onClose } = await open(true)
    const overlay = el.firstChild
    expect(overlay.className).toContain('inset-0')
    expect(overlay.className).not.toContain('bg-black')
    await act(async () => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('lists the selected products (code, variant, quantity), lets you collapse and remove them, and saves them', async () => {
    const { el, onClose, onAdd } = await open(true)
    expect(el.querySelector('[data-testid="picker-selected"]')).toBeNull()
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('Kaos Bahu Miring')))
    await click(plusFor(el, 0)); await click(plusFor(el, 0)); await click(plusFor(el, 1))
    const panel = el.querySelector('[data-testid="picker-selected"]')
    expect(panel.textContent).toContain('picker_selected_title:3')
    expect(panel.textContent).toContain('C002')
    expect(panel.textContent).toContain('Black/L')
    expect(panel.textContent).toContain('× 2')
    expect(panel.textContent).toContain('White/M')
    // collapse
    await click(panel.querySelector('button[aria-expanded]'))
    expect(panel.querySelector('ul')).toBeNull()
    await click(panel.querySelector('button[aria-expanded]'))
    // remove the White/M line
    await click([...panel.querySelectorAll('li')].find((li) => li.textContent.includes('White/M')).querySelector('button'))
    expect(panel.textContent).not.toContain('White/M')
    expect(panel.textContent).toContain('picker_selected_title:2')
    // save
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'common.save'))
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ variantId: 11, qty: 2, sku: 'C002' })])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Cancel and with X', async () => {
    const a = await open(true)
    await click([...a.el.querySelectorAll('button')].find((b) => b.textContent === 'common.cancel'))
    expect(a.onClose).toHaveBeenCalledTimes(1)
    const b = await open(true)
    await click([...b.el.querySelectorAll('button')].find((x) => x.textContent === '✕'))
    expect(b.onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ProductPickerModal on desktop', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  it('keeps the dialog: closes on a click outside, no review panel', async () => {
    const { el, onClose } = await open(false)
    expect(el.firstChild.className).toContain('bg-black/40')
    await act(async () => { el.firstChild.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
