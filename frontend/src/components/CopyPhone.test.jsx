// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o?.phone ? `${k}:${o.phone}` : k) }) }))
const copy = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
vi.mock('../utils/clipboard', () => ({ copyToClipboard: copy }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import CopyPhone from './CopyPhone'

describe('CopyPhone', () => {
  it('copies the full number on one click without bubbling to the row, then shows a check', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const rowClick = vi.fn()
    await act(async () => { createRoot(el).render(<div onClick={rowClick}><CopyPhone phone="0912345678" /></div>) })
    expect(el.textContent).toContain('0912345678')
    const btn = el.querySelector('button')
    expect(btn.getAttribute('aria-label')).toBe('page_orders.copy_phone_aria:0912345678')
    await act(async () => { btn.click() })
    expect(copy).toHaveBeenCalledWith('0912345678')
    expect(rowClick).not.toHaveBeenCalled()
    expect(btn.className).toContain('text-green-600')
  })
  it('renders nothing without a number', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    await act(async () => { createRoot(el).render(<CopyPhone phone="" />) })
    expect(el.innerHTML).toBe('')
  })
})
