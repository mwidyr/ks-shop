// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, o) => (o?.date ? `${k}:${o.date}` : k) }),
}))
import KeepDateFields from './KeepDateFields'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function mount(props) {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<KeepDateFields onDate={() => {}} onType={() => {}} {...props} />) })
  return el
}

describe('KeepDateFields', () => {
  it('shipping mode shows only the export date', async () => {
    const el = await mount({ date: '2026-10-30', type: 'shipping' })
    expect(el.querySelector('[data-testid=keep-calc]').textContent).toBe('keep_date.export_from:2026-10-29')
  })
  it('delivery mode shows ship and export dates', async () => {
    const el = await mount({ date: '2026-10-30', type: 'delivery' })
    const text = el.querySelector('[data-testid=keep-calc]').textContent
    expect(text).toContain('keep_date.ship_date:2026-10-27')
    expect(text).toContain('keep_date.export_from:2026-10-26')
  })
  it('changing the type reports it and commits', async () => {
    const onType = vi.fn(); const onCommit = vi.fn()
    const el = await mount({ date: '2026-10-30', type: 'shipping', onType, onCommit })
    const sel = el.querySelector('select')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(sel, 'delivery')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onType).toHaveBeenCalledWith('delivery')
    expect(onCommit).toHaveBeenCalledWith('2026-10-30', 'delivery')
  })
})
