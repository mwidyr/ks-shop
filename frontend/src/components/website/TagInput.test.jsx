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
})
