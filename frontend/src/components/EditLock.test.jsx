// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AccessContext } from '../context/AccessContext'
import EditLock from './EditLock'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function render(access, path) {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(
      <AccessContext.Provider value={access}>
        <MemoryRouter initialEntries={[path]}>
          <EditLock>
            <input defaultValue="name" />
            <button type="button">Save</button>
            <a href="/orders">open</a>
          </EditLock>
        </MemoryRouter>
      </AccessContext.Provider>,
    )
  })
  return el
}

describe('EditLock', () => {
  const role = (level) => ({ loaded: true, isSuperUser: false, access: { orders: level } })
  it('disables every field and button for a view-only role', async () => {
    const el = await render(role('view'), '/orders/12')
    expect(el.querySelector('fieldset').disabled).toBe(true)
    expect(el.querySelector('input').matches(':disabled')).toBe(true)
    expect(el.querySelector('button').matches(':disabled')).toBe(true)
    expect(el.querySelector('a')).not.toBeNull() // links still work
  })
  it('leaves the page untouched for an edit role and for the super admin', async () => {
    const el = await render(role('edit'), '/orders/12')
    expect(el.querySelector('fieldset')).toBeNull()
    expect(el.querySelector('button').matches(':disabled')).toBe(false)
    const su = await render({ loaded: true, isSuperUser: true, access: {} }, '/orders/12')
    expect(su.querySelector('fieldset')).toBeNull()
  })
  it('does not lock while the access map is still loading', async () => {
    const el = await render({ loaded: false, isSuperUser: false, access: null }, '/orders/12')
    expect(el.querySelector('fieldset')).toBeNull()
  })
})
