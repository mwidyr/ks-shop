// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) }) }))

let calls = []
vi.mock('../../api/website', () => ({
  listContent: vi.fn((params) => {
    calls.push(params)
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `T${i + 1}`, lang: 'id', is_published: i % 2 === 0, updated_at: '2026-10-18T10:00:00Z' }))
    return Promise.resolve({ items, total: 37, page: params.page, page_size: params.page_size })
  }),
}))

import ContentList, { pageNumbers } from './ContentList'

describe('pageNumbers', () => {
  it('keeps first, last and neighbours with gaps', () => {
    expect(pageNumbers(1, 4)).toEqual([1, 2, 3, 4])
    expect(pageNumbers(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20])
    expect(pageNumbers(1, 20)).toEqual([1, 2, '…', 20])
  })
})

describe('ContentList', () => {
  beforeEach(() => { calls = [] })
  it('asks the server for 10 per page and goes back to page 1 when a filter changes', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => { root.render(<ContentList onOpen={() => {}} onNew={() => {}} />) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(calls[0]).toMatchObject({ page: 1, page_size: 10, sort: 'updated_desc' })
    expect(el.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(el.textContent).toContain('page_website.content.showing{"from":1,"to":10,"total":37}')

    const click = (n) => act(async () => { n.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await click([...el.querySelectorAll('nav button')].find((b) => b.textContent === '3'))
    expect(calls.at(-1).page).toBe(3)
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'en' || b.textContent === 'page_website.common.language_en'))
    expect(calls.at(-1)).toMatchObject({ page: 1, lang: 'en' })
  })
})
