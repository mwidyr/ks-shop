// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let lang = 'id'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: lang } }) }))
import DateInput from './DateInput'
import MonthSwitcher from './MonthSwitcher'

async function mount(el) {
  const c = document.createElement('div'); document.body.appendChild(c)
  await act(async () => { createRoot(c).render(el) })
  return c
}

describe('language-aware date pickers', () => {
  it('shows the calendar in the selected system language, not the browser language', async () => {
    for (const [l, title] of [['id', 'November 2026'], ['en', 'November 2026'], ['zh', '2026年11月']]) {
      lang = l
      const c = await mount(<DateInput value="2026-11-05" onChange={() => {}} />)
      await act(async () => { c.querySelector('input').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(c.textContent).toContain(title)
      if (l === 'id') expect(c.textContent).toContain('Sen')
      if (l === 'zh') expect(c.textContent).toContain('週一')
    }
  })

  it('picks a date and emits YYYY-MM-DD', async () => {
    lang = 'en'
    const onChange = vi.fn()
    const c = await mount(<DateInput value="2026-11-05" onChange={onChange} />)
    await act(async () => { c.querySelector('input').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const day = [...c.querySelectorAll('button')].find((b) => b.textContent === '12')
    await act(async () => { day.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onChange).toHaveBeenCalledWith('2026-11-12')
  })

  it('month switcher follows the language and steps by month', async () => {
    lang = 'id'
    const onChange = vi.fn()
    const c = await mount(<MonthSwitcher value="2026-12" onChange={onChange} />)
    expect(c.textContent).toContain('Desember 2026')
    await act(async () => { [...c.querySelectorAll('button')][1].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onChange).toHaveBeenCalledWith('2027-01')
  })
})
