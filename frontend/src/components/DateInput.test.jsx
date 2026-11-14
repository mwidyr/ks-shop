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

const setValue = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})
const blur = (input) => act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
const change = (select, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true }))
})

describe('language-aware date pickers', () => {
  it('shows the calendar in the selected system language, not the browser language', async () => {
    for (const [l, month] of [['id', 'November'], ['en', 'November'], ['zh', '11月']]) {
      lang = l
      const c = await mount(<DateInput value="2026-11-05" onChange={() => {}} />)
      await act(async () => { c.querySelector('input').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      const [monthSel, yearSel] = c.querySelectorAll('select')
      expect(monthSel.options[monthSel.selectedIndex].textContent).toBe(month)
      expect(yearSel.value).toBe('2026')
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

  it('jumps to a month and a year with the selectors instead of clicking back one month at a time', async () => {
    lang = 'en'
    const onChange = vi.fn()
    const c = await mount(<DateInput value="" onChange={onChange} defaultView="1996-01" />)
    await act(async () => { c.querySelector('input').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    let [monthSel, yearSel] = c.querySelectorAll('select')
    expect(yearSel.value).toBe('1996') // a birth date field opens years back, not on this month
    await change(yearSel, '1990')
    ;[monthSel, yearSel] = c.querySelectorAll('select')
    await change(monthSel, '11')
    expect([...yearSel.options].some((o) => o.value === '1925')).toBe(true) // the whole range is one choice away
    const day = [...c.querySelectorAll('button')].find((b) => b.textContent === '25')
    await act(async () => { day.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onChange).toHaveBeenCalledWith('1990-12-25')
  })

  it('can be typed: a full ISO date at once, other forms when the field is left, nonsense is refused', async () => {
    lang = 'en'
    const onChange = vi.fn()
    const c = await mount(<DateInput value="" onChange={onChange} />)
    const input = c.querySelector('input')
    await setValue(input, '1990-12-25')
    expect(onChange).toHaveBeenLastCalledWith('1990-12-25')

    onChange.mockClear()
    await setValue(input, '25/12/1991') // not taken while typing ...
    expect(onChange).not.toHaveBeenCalled()
    await blur(input) // ... but read when the field is left
    expect(onChange).toHaveBeenLastCalledWith('1991-12-25')

    onChange.mockClear()
    await setValue(input, '31/02/1991') // 31 February
    await blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(c.textContent).toContain('shared.date_invalid')

    await setValue(input, '')
    await blur(input)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })
})
