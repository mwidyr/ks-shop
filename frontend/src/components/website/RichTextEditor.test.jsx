// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import RichTextEditor from './RichTextEditor'
import { storedFromHtml, headingHtml, htmlForEditor } from '../../utils/richText'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k.split('.').pop() }) }))

async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(node) })
  await act(async () => { await Promise.resolve() })
  return el
}
const labels = (el) => [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))

describe('RichTextEditor toolbar (the PDF tool table)', () => {
  it('H2 / H3: bold, italic, underline, link - no lists', async () => {
    const el = await mount(<RichTextEditor mode="heading" value={{ text: 'Hi' }} onChange={() => {}} />)
    expect(labels(el)).toEqual(['bold', 'italic', 'underline', 'link'])
  })
  it('Text and Introduction: also bullet and numbered list', async () => {
    const el = await mount(<RichTextEditor mode="text" value={{ text: 'Hi' }} onChange={() => {}} />)
    expect(labels(el)).toEqual(['bold', 'italic', 'underline', 'link', 'bullet', 'ordered'])
  })
})

describe('rich text helpers', () => {
  it('plain single paragraph stays plain, everything else keeps its html', () => {
    expect(storedFromHtml('<p>Hello</p>', 'Hello')).toEqual({ text: 'Hello', html: '' })
    expect(storedFromHtml('<p>Hello <u>x</u></p>', 'Hello x').html).toBe('<p>Hello <u>x</u></p>')
    expect(storedFromHtml('<p>a</p><p>b</p>', 'a\nb').html).toBe('<p>a</p><p>b</p>')
    expect(storedFromHtml('<ul><li><p>a</p></li></ul>', 'a').html).toContain('<ul>')
  })
  it('heading html loses the outer paragraph; editor html is rebuilt from text or html', () => {
    expect(headingHtml('<p>A <strong>b</strong></p>')).toBe('A <strong>b</strong>')
    expect(htmlForEditor({ text: 'a<b' }, {})).toBe('<p>a&lt;b</p>')
    expect(htmlForEditor({ text: 'x', html: 'x <em>y</em>' }, {})).toBe('<p>x <em>y</em></p>')
    expect(htmlForEditor({ text: 'x', html: '<ul><li>a</li></ul>' }, {})).toBe('<ul><li>a</li></ul>')
  })
})
