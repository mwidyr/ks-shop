// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))

const customers = [{ id: 7, name: 'DIAH', phone: '0981642493' }]
const get = vi.fn()
vi.mock('../api/client', () => ({ default: { get: (...a) => get(...a) } }))

import CustomerPicker from './CustomerPicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function setup() {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  const onChange = vi.fn()
  await act(async () => { root.render(<div><CustomerPicker onChange={onChange} /><button id="elsewhere" type="button">elsewhere</button></div>) })
  const [name, phone] = el.querySelectorAll('input')
  return { el, root, onChange, name, phone }
}

// React tracks the input value itself: set it through the native setter, then fire the event
async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const focus = (input) => act(async () => { input.focus(); input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
const suggestions = (el) => el.querySelectorAll('button[type="button"]:not(#elsewhere)').length

describe('CustomerPicker suggestion list', () => {
  beforeEach(() => { document.body.innerHTML = ''; get.mockReset(); get.mockResolvedValue({ data: customers }) })

  it('closes when clicking outside, and opens again when the name field is focused', async () => {
    const { el, name } = await setup()
    await focus(name)
    await type(name, 'DIAH')
    expect(suggestions(el)).toBe(1)
    await act(async () => { document.getElementById('elsewhere').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(suggestions(el)).toBe(0)
    await focus(document.getElementById('elsewhere'))
    await focus(name)
    expect(suggestions(el)).toBe(1)
  })

  it('closes on a touch outside (phones)', async () => {
    const { el, name } = await setup()
    await focus(name); await type(name, 'DIAH')
    await act(async () => { document.body.dispatchEvent(new Event('touchstart', { bubbles: true })) })
    expect(suggestions(el)).toBe(0)
  })

  it('closes on Esc and when the phone field is focused (it sits under the list)', async () => {
    const { el, name, phone } = await setup()
    await focus(name); await type(name, 'DIAH')
    await act(async () => { name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(suggestions(el)).toBe(0)
    await focus(name)
    expect(suggestions(el)).toBe(1)
    await focus(phone)
    expect(suggestions(el)).toBe(0)
  })

  it('phone first, then a name that already exists: the list does not stay open once the user moves on', async () => {
    const { el, name, phone } = await setup()
    await focus(phone); await type(phone, '0912345678')
    await focus(name); await type(name, 'DIAH')
    expect(suggestions(el)).toBe(1)
    await focus(phone) // back to the phone field, still no customer picked
    expect(suggestions(el)).toBe(0)
    expect(phone.value).toBe('0912345678') // the typed phone was not overwritten
  })

  it('a late search answer does not reopen the list after the user left the name field', async () => {
    let resolve
    get.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { el, name, phone } = await setup()
    await focus(name)
    // start the search without waiting for it (no act around the pending request)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'DIAH')
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await focus(phone) // user moves to the phone while the search is still running
    await act(async () => { resolve({ data: customers }) })
    expect(suggestions(el)).toBe(0)
  })

  it('picking a customer fills both fields and closes the list', async () => {
    const { el, name, phone, onChange } = await setup()
    await focus(name); await type(name, 'DIAH')
    await act(async () => { el.querySelector('button[type="button"]:not(#elsewhere)').click() })
    expect(suggestions(el)).toBe(0)
    expect(name.value).toBe('DIAH')
    expect(phone.value).toBe('0981642493')
    expect(onChange).toHaveBeenLastCalledWith(customers[0])
  })
})
