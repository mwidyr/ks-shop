// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({ getStoreTutorial: vi.fn(), saveStoreTutorial: vi.fn() }))
vi.mock('../../api/website', () => api)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
vi.mock('../../utils/image', () => ({ resolveUrl: (u) => u, uploadImageFile: vi.fn(async () => '/uploads/new.png') }))
vi.mock('./RichTextEditor', () => ({ default: ({ onChange }) => <button type="button" data-testid="ed" onClick={() => onChange({ text: 'Ambil struk', html: '' })}>type</button> }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import TutorialCard, { tutorialHtml } from './TutorialCard'

describe('tutorialHtml', () => {
  it('keeps formatted html, wraps plain text, and returns empty for nothing', () => {
    expect(tutorialHtml({ text: 'x', html: '<p><strong>x</strong></p>' })).toBe('<p><strong>x</strong></p>')
    expect(tutorialHtml({ text: 'a<b>\nc', html: '' })).toBe('<p>a&lt;b&gt;<br>c</p>')
    expect(tutorialHtml({ text: '  ', html: '' })).toBe('')
  })
})

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<TutorialCard />) })
  await act(async () => { await Promise.resolve() })
  return el
}
const pickFile = (el, file) => act(async () => {
  const input = el.querySelector('[data-testid="tutorial-file"]')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
})
const click = (node) => act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text))

describe('TutorialCard', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getStoreTutorial.mockResolvedValue({ image_url: '', html: { id: '', en: '', zh: '' } }); api.saveStoreTutorial.mockImplementation(async (b) => b) })

  it('saves the typed text and an uploaded image', async () => {
    const el = await mount()
    await click(el.querySelector('[data-testid="ed"]'))
    await pickFile(el, new File(['x'], 'r.png', { type: 'image/png' }))
    expect(el.querySelector('[data-testid="tutorial-preview"] img').getAttribute('src')).toBe('/uploads/new.png')
    await click(button(el, 'page_website.common.save'))
    const body = api.saveStoreTutorial.mock.calls[0][0]
    expect(body.image_url).toBe('/uploads/new.png')
    expect(body.html.id).toBe('<p>Ambil struk</p>')
    expect(body.html.en).toBe('')
  })

  it('rejects a non-image file without uploading', async () => {
    const el = await mount()
    await pickFile(el, new File(['x'], 'r.pdf', { type: 'application/pdf' }))
    expect(el.querySelector('[role="alert"]').textContent).toBe('page_website.tutorial.bad_type')
    expect(el.querySelector('[data-testid="tutorial-preview"] img')).toBeNull()
  })
})
