// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../../api/website', () => ({ listContentTags: vi.fn(() => Promise.resolve(['spring', 'summer sale', 'winter'])) }))
import TagInput from './TagInput'

function Harness({ initial = [], spy }) {
  const [tags, setTags] = useState(initial)
  spy.get = () => tags
  return <TagInput value={tags} onChange={setTags} />
}
async function mount(initial) {
  const spy = {}
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<Harness initial={initial} spy={spy} />) })
  return { el, spy, input: el.querySelector('input') }
}
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})
const key = (input, k) => act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })

describe('TagInput', () => {
  it('Enter adds a chip (multi-word phrases too), duplicates are ignored, x and Backspace remove', async () => {
    const { el, spy, input } = await mount([])
    await type(input, '  long tail   keyword phrase ')
    await key(input, 'Enter')
    expect(spy.get()).toEqual(['long tail keyword phrase'])
    await type(input, 'Long Tail Keyword Phrase'); await key(input, 'Enter')
    expect(spy.get()).toHaveLength(1)
    await type(input, '#second'); await key(input, 'Enter')
    expect(spy.get()).toEqual(['long tail keyword phrase', 'second'])
    await key(input, 'Backspace') // empty input -> removes the last chip
    expect(spy.get()).toEqual(['long tail keyword phrase'])
    await act(async () => { el.querySelector('button[aria-label^="remove"]').click() })
    expect(spy.get()).toEqual([])
  })
  it('suggests tags used before and adds one on click without restricting free text', async () => {
    const { el, spy, input } = await mount(['winter'])
    await act(async () => { input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); input.focus() })
    await type(input, 's')
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    const options = [...el.querySelectorAll('li button')].map((b) => b.textContent)
    expect(options).toEqual(['spring', 'summer sale']) // "winter" is already chosen
    await act(async () => { el.querySelector('li button').click() })
    expect(spy.get()).toEqual(['winter', 'spring'])
    await type(input, 'totally new'); await key(input, 'Enter')
    expect(spy.get()).toContain('totally new')
  })
  it('a comma ends a tag: typing "a," adds it and keeps the rest of the text', async () => {
    const { spy, input } = await mount([])
    await type(input, 'outfit wanita, ootd')
    expect(spy.get()).toEqual(['outfit wanita'])
    expect(input.value).toBe('ootd')
    await type(input, 'ootd, mix and match，')
    expect(spy.get()).toEqual(['outfit wanita', 'ootd', 'mix and match'])
    expect(input.value).toBe('')
  })
  it('pasting a comma-separated list splits it into tags without Enter, skipping duplicates and blanks', async () => {
    const { spy, input } = await mount(['ootd'])
    await act(async () => {
      const ev = new Event('paste', { bubbles: true, cancelable: true })
      ev.clipboardData = { getData: () => 'outfit wanita casual, OOTD, , mix and match outfit,#wanita taiwan' }
      input.dispatchEvent(ev)
    })
    expect(spy.get()).toEqual(['ootd', 'outfit wanita casual', 'mix and match outfit', 'wanita taiwan'])
  })
  it('text without a comma stays as typed until Enter or blur', async () => {
    const { spy, input } = await mount([])
    await type(input, 'single phrase')
    expect(spy.get()).toEqual([])
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(spy.get()).toEqual(['single phrase'])
  })
})
