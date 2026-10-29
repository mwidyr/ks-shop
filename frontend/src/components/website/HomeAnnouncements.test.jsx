// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({ getHomeAnnouncements: vi.fn(), saveHomeAnnouncements: vi.fn((l) => Promise.resolve(l)) }))
vi.mock('../../api/website', () => api)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import HomeAnnouncements from './HomeAnnouncements'

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<HomeAnnouncements />) })
  await act(async () => { await Promise.resolve() })
  return el
}
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})
const click = (b) => act(async () => { b.click() })

describe('HomeAnnouncements', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); api.getHomeAnnouncements.mockResolvedValue([{ id: 1, text_id: 'Satu', text_en: 'One', text_zh: '一', is_active: true }]) })

  it('adds a message one by one (any language is enough), reorders and saves the whole list', async () => {
    const el = await mount()
    const add = el.querySelector('form button[type=submit]')
    expect(add.disabled).toBe(true)
    await type(el.querySelector('form input'), 'Dua')
    expect(add.disabled).toBe(false)
    await click(add)
    expect(el.querySelectorAll('[data-testid=announcement-row]')).toHaveLength(2)
    await click(el.querySelectorAll('button[aria-label="page_website.common.up"]')[1])
    await click([...el.querySelectorAll('button')].find((b) => b.textContent.includes('announcements.save')))
    expect(api.saveHomeAnnouncements).toHaveBeenCalledWith([
      { text_id: 'Dua', text_en: '', text_zh: '', is_active: true },
      { text_id: 'Satu', text_en: 'One', text_zh: '一', is_active: true },
    ])
  })

  it('deletes a message', async () => {
    const el = await mount()
    await click(el.querySelector('button[aria-label="page_website.announcements.delete"]'))
    expect(el.querySelectorAll('[data-testid=announcement-row]')).toHaveLength(0)
  })
})
