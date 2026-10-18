// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { pageSlice, useDebouncedValue } from './hooks'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('pageSlice', () => {
  const list = Array.from({ length: 120 }, (_, i) => i)
  it('returns the rows of the page and the totals', () => {
    const p = pageSlice(list, 2, 50)
    expect(p.rows[0]).toBe(50)
    expect(p.rows.length).toBe(50)
    expect(p).toMatchObject({ page: 2, totalPages: 3, total: 120 })
  })
  it('last page is short, out-of-range pages are clamped', () => {
    expect(pageSlice(list, 3, 50).rows.length).toBe(20)
    expect(pageSlice(list, 9, 50).page).toBe(3)
    expect(pageSlice(list, 0, 50).page).toBe(1)
  })
  it('an empty list is one empty page', () => {
    expect(pageSlice([], 1, 50)).toMatchObject({ rows: [], page: 1, totalPages: 1, total: 0 })
  })
})

describe('useDebouncedValue', () => {
  function Probe({ value, spy }) {
    spy.value = useDebouncedValue(value, 300)
    return null
  }
  it('follows the value only after it stops changing', async () => {
    vi.useFakeTimers()
    const spy = {}
    const el = document.createElement('div')
    const root = createRoot(el)
    await act(async () => { root.render(<Probe value="a" spy={spy} />) })
    expect(spy.value).toBe('a')
    await act(async () => { root.render(<Probe value="ab" spy={spy} />) })
    await act(async () => { vi.advanceTimersByTime(200) })
    await act(async () => { root.render(<Probe value="abc" spy={spy} />) })
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(spy.value).toBe('a') // typing is still going on: nothing fired
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(spy.value).toBe('abc') // one update, with the final text
    vi.useRealTimers()
  })
})
