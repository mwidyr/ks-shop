// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AccessContext } from '../../context/AccessContext'

const cfg = {
  enabled: true, preset: 'typewriter', timing: { typeMs: 90, holdMs: 2400, eraseMs: 45, pauseMs: 400 },
  style: { background: '#A0344F', text: '#FFF5F7', accent: '#F9C9D5', showPrompt: true, fontSize: 16, radius: 10 },
  messages: [{ id: 'm1', emoji: '🚚', text: { id: '', en: 'Free shipping', zh: '' }, url: '', enabled: true, from: null, until: null }],
}
const state = { draft: cfg, published: cfg, has_draft: false, can_rollback: true, log: [] }
const api = vi.hoisted(() => ({ getAnnouncementBar: vi.fn(), saveAnnouncementBarDraft: vi.fn(), publishAnnouncementBar: vi.fn(), rollbackAnnouncementBar: vi.fn() }))
vi.mock('../../api/website', () => api)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k), i18n: { language: 'en' } }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import AnnouncementBarPanel from './AnnouncementBarPanel'

async function mount(isSuperUser) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<AccessContext.Provider value={{ loaded: true, isSuperUser, access: {} }}><AnnouncementBarPanel /></AccessContext.Provider>) })
  await act(async () => { await Promise.resolve() })
  return el
}
const btn = (el, key) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(key))
const setVal = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('AnnouncementBarPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''; vi.clearAllMocks()
    api.getAnnouncementBar.mockResolvedValue(state)
    api.saveAnnouncementBarDraft.mockImplementation((c) => Promise.resolve({ ...state, draft: c, has_draft: true }))
    api.publishAnnouncementBar.mockImplementation((c) => Promise.resolve({ ...state, draft: c, published: c }))
  })

  it('saves a draft without publishing, and an Admin publishes after confirming', async () => {
    window.confirm = vi.fn(() => true)
    const el = await mount(true)
    await act(async () => { btn(el, 'save_draft').click() })
    expect(api.saveAnnouncementBarDraft).toHaveBeenCalledTimes(1)
    expect(api.publishAnnouncementBar).not.toHaveBeenCalled()
    await act(async () => { btn(el, 'announcements.publish').click() })
    expect(window.confirm).toHaveBeenCalledWith('page_website.announcements.confirm_publish')
    expect(api.publishAnnouncementBar).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })

  it('only an Admin can publish or roll back', async () => {
    const el = await mount(false)
    expect(btn(el, 'announcements.publish').disabled).toBe(true)
    expect(btn(el, 'announcements.rollback').disabled).toBe(true)
    expect(btn(el, 'save_draft').disabled).toBe(false)
  })

  it('blocks publishing and shows a red warning when the contrast fails AA', async () => {
    const el = await mount(true)
    const text = el.querySelector('input[type="color"][aria-label="page_website.announcements.text_color"]')
    const auto = [...el.querySelectorAll('input[type="checkbox"]')].find((c) => c.parentElement.textContent.includes('text_auto'))
    await act(async () => { auto.click() })
    await setVal(text, '#b04860')
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    expect(btn(el, 'announcements.publish').disabled).toBe(true)
  })

  it('limits the list to 6 messages', async () => {
    const el = await mount(true)
    for (let i = 0; i < 5; i++) await act(async () => { btn(el, 'add_message').click() })
    expect(el.querySelectorAll('[data-testid="announcement-row"]').length).toBe(6)
    expect(btn(el, 'add_message').disabled).toBe(true)
  })
})
