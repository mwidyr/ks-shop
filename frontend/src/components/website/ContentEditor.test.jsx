// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k.split('.').pop()}${JSON.stringify(o)}` : k.split('.').pop()), i18n: { language: 'en' } }) }))
vi.mock('../../api/categories', () => ({ listCategories: () => Promise.resolve([]) }))
vi.mock('../../api/hosts', () => ({ listHosts: () => Promise.resolve([]) }))
vi.mock('../../api/products', () => ({ listProducts: () => Promise.resolve([]) }))
vi.mock('../../utils/image', () => ({ uploadImageFile: vi.fn(), resolveUrl: (u) => u }))

const api = vi.hoisted(() => ({
  getContent: vi.fn(), createContent: vi.fn(), updateContent: vi.fn(), deleteContent: vi.fn(), discardContentDraft: vi.fn(), checkContentSlug: vi.fn(),
  listContentTypes: vi.fn(), listContentTemplates: vi.fn(), getContentTemplate: vi.fn(), createContentTemplate: vi.fn(), listContentTags: vi.fn(),
}))
vi.mock('../../api/website', () => api)

import ContentEditor, { AUTOSAVE_MS } from './ContentEditor'

async function mount(props) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<ContentEditor onBack={() => {}} onSaved={() => {}} {...props} />) })
  await act(async () => { await Promise.resolve() })
  return el
}
const type = (input, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})
const btn = (el, label) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = (n) => act(async () => { n.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const status = (el) => el.querySelector('[role="status"]').textContent.trim()

beforeEach(() => {
  vi.useFakeTimers()
  Object.values(api).forEach((f) => f.mockReset())
  api.listContentTypes.mockResolvedValue([{ id: 1, slug: 'article', names: { en: 'Article' } }])
  api.listContentTemplates.mockResolvedValue([])
  api.listContentTags.mockResolvedValue([])
  api.createContent.mockResolvedValue({ id: 5 })
  api.updateContent.mockResolvedValue({ id: 5 })
  window.confirm = vi.fn(() => true)
})
afterEach(() => vi.useRealTimers())

const dto = (extra = {}) => ({ id: 5, type: 'article', slug: 'hello', lang: 'id', title: { id: 'Hello' }, summary: {}, intro_html: {}, body: { id: [] }, tags: [], is_published: false, ...extra })

describe('ContentEditor', () => {
  it('a new article autosaves a draft after the typing pause: Unsaved changes -> Saving -> Saved', async () => {
    const el = await mount({ id: null })
    expect(status(el)).toBe('')
    await type(el.querySelector('input[aria-label="s_title"]'), 'My first article')
    expect(status(el)).toBe('status_unsaved')
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS - 100) })
    expect(api.createContent).not.toHaveBeenCalled() // still waiting for the typing pause
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(api.createContent).toHaveBeenCalledTimes(1)
    const [payload, mode] = api.createContent.mock.calls[0]
    expect(mode).toBe('draft')
    expect(payload).toMatchObject({ slug: 'my-first-article', is_published: false })
    expect(status(el)).toBe('status_saved')
    // saved once: the next change goes to the same article
    await type(el.querySelector('input[aria-label="s_title"]'), 'My first article!')
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS + 100) })
    expect(api.updateContent).toHaveBeenCalledWith(5, expect.anything(), 'draft')
  })

  it('does not autosave an article without a title', async () => {
    const el = await mount({ id: null })
    await click(btn(el, 'preview')) // any non-content interaction
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS * 2) })
    expect(api.createContent).not.toHaveBeenCalled()
  })

  it('shows Publish for an unpublished article and Update for a published one; Update is a normal save', async () => {
    api.getContent.mockResolvedValue(dto())
    let el = await mount({ id: 5 })
    expect(btn(el, 'publish')).toBeTruthy()
    expect(btn(el, 'update')).toBeFalsy()
    await click(btn(el, 'publish'))
    expect(api.updateContent).toHaveBeenCalledWith(5, expect.objectContaining({ is_published: true }))
    expect(btn(el, 'update')).toBeTruthy() // now live

    api.getContent.mockResolvedValue(dto({ is_published: true }))
    el = await mount({ id: 5 })
    expect(btn(el, 'update')).toBeTruthy()
    expect(btn(el, 'publish')).toBeFalsy()
  })

  it('on a published article Save Draft only writes the draft (mode=draft) and keeps it live', async () => {
    api.getContent.mockResolvedValue(dto({ is_published: true }))
    const el = await mount({ id: 5 })
    await click(btn(el, 'save_draft'))
    const [, , mode] = api.updateContent.mock.calls[0]
    expect(mode).toBe('draft')
    expect(btn(el, 'update')).toBeTruthy()
  })

  it('offers an unpublished draft of a published article and does not autosave over it', async () => {
    api.getContent.mockResolvedValue(dto({ is_published: true, draft_saved_at: '2026-10-18T10:00:00Z', draft: dto({ title: { id: 'Draft title' } }) }))
    const el = await mount({ id: 5 })
    expect(el.textContent).toContain('draft_continue')
    await type(el.querySelector('input[aria-label="s_title"]'), 'Changed while banner is open')
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS * 2) })
    expect(api.updateContent).not.toHaveBeenCalled()
    await click(btn(el, 'draft_continue'))
    expect(el.querySelector('input[aria-label="s_title"]').value).toBe('Draft title')
    expect(status(el)).toBe('status_saved') // the draft is what was saved
  })

  it('Publish is refused with a message when the title is missing', async () => {
    const el = await mount({ id: null })
    await click(btn(el, 'publish'))
    expect(api.createContent).not.toHaveBeenCalled()
    expect(el.querySelector('[role="alert"]').textContent).toContain('err_title')
  })

  it('applying a template gives the article its own copy of the blocks', async () => {
    api.listContentTemplates.mockResolvedValue([{ id: 9, name: 'Layout', block_count: 1 }])
    api.getContentTemplate.mockResolvedValue({ id: 9, name: 'Layout', blocks: [{ type: 'h2', text: 'From template' }] })
    const el = await mount({ id: null })
    const select = el.querySelector('select[aria-label="template_choose"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '9'); select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(btn(el, 'template_apply'))
    await act(async () => { await Promise.resolve() })
    expect(el.querySelectorAll('[data-placeholder="page_website.content.editor.h2_placeholder"]').length + el.querySelectorAll('.article-block-text').length).toBeGreaterThan(0)
    expect(el.textContent).toContain('From template')
  })
})
