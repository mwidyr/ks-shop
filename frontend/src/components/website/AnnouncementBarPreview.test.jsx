// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import AnnouncementBar from './AnnouncementBarPreview'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const bar = {
  timing: { typeMs: 90, holdMs: 2400, eraseMs: 45, pauseMs: 400 },
  style: { background: '#A0344F', text: '#FFF5F7', accent: '#F9C9D5', showPrompt: true, fontSize: 16, radius: 10 },
  messages: [{ text: 'Hi', url: '' }, { text: '你好嗎', url: '/products' }],
}
const shown = (el) => el.querySelector('[aria-live="off"]').textContent
// state updates only flush when act() exits, so advance in small steps to let each phase schedule its next timer
const tick = async (ms) => { for (let t = 0; t < ms; t += 5) await act(async () => { await vi.advanceTimersByTimeAsync(5) }) }
async function mount(props) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<AnnouncementBar bar={bar} reducedMotion={false} {...props} />) })
  return el
}

describe('AnnouncementBar (typewriter)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('types, holds, erases and moves on to the next message', async () => {
    const el = await mount()
    expect(shown(el)).toBe('')
    await tick(90); expect(shown(el)).toBe('H')
    await tick(90); expect(shown(el)).toBe('Hi')
    await tick(2300); expect(shown(el)).toBe('Hi') // holding
    await tick(200); expect(shown(el)).toBe('') // erased
    await tick(520); expect(shown(el)).toBe('你') // after the pause the next message starts
    expect(el.querySelector('a').getAttribute('href')).toBe('/products') // the whole bar links when the message has a URL
    await tick(200); expect(shown(el)).toBe('你好嗎')
  })

  it('pauses while the bar is hovered', async () => {
    const el = await mount()
    await tick(90); expect(shown(el)).toBe('H')
    await act(async () => { el.querySelector('.ra-bar').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    await tick(1000)
    expect(shown(el)).toBe('H')
    await act(async () => { el.querySelector('.ra-bar').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })) })
    await tick(100)
    expect(shown(el)).toBe('Hi')
  })

  it('shows the first message in full, without typing, under reduced motion', async () => {
    const el = await mount({ reducedMotion: true })
    expect(shown(el)).toBe('Hi')
    await tick(5000); expect(shown(el)).toBe('Hi')
  })

  it('is a Promotions region with the full message for screen readers, and renders nothing without messages', async () => {
    const el = await mount()
    expect(el.querySelector('[role="region"]').getAttribute('aria-label')).toBe('Promotions')
    expect(el.querySelector('.ra-sr').textContent).toBe('Hi')
    const empty = await mount({ bar: { ...bar, messages: [] } })
    expect(empty.innerHTML).toBe('')
  })
})
