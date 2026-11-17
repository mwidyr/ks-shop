// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({ getTemplates: vi.fn(), uploadTemplate: vi.fn(), activateTemplate: vi.fn() }))
vi.mock('../../api/shippingWorkbench', () => api)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o?.v ? `${k}:${o.v}` : k) }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import TemplatesCard from './TemplatesCard'

const data = [
  { provider: 'cvs_711', builtin_version: '1.6', active: { id: 5, filename: 'new.xlsm', version: '1.7', uploaded_at: '2026-11-18T10:00:00Z', uploaded_by: 'Ana' }, history: [{ id: 4, filename: 'old.xlsm', version: '1.6', uploaded_at: '2026-11-17T10:00:00Z', uploaded_by: 'Bo' }] },
  { provider: 'cvs_familymart', builtin_version: '', active: null, history: [] },
]

async function mount(canEdit = true) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<TemplatesCard canEdit={canEdit} />) })
  await act(async () => { await Promise.resolve() })
  return el
}

describe('TemplatesCard', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getTemplates.mockResolvedValue(data) })

  it('shows the active upload and the built-in fallback', async () => {
    const el = await mount()
    expect(el.querySelector('[data-testid="tpl-cvs_711"]').textContent).toContain('new.xlsm')
    expect(el.querySelector('[data-testid="tpl-cvs_familymart"]').textContent).toContain('page_shipping_wb.tpl_builtin')
  })

  it('uploads the chosen file and shows the server error when the file is refused', async () => {
    api.uploadTemplate.mockRejectedValueOnce({ response: { data: { error: 'this template is version 1.5, older than the current version 1.7' } } })
    const el = await mount()
    const input = el.querySelector('[data-testid="tpl-file-cvs_711"]')
    const file = new File(['x'], 'a.xlsm')
    await act(async () => { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(api.uploadTemplate).toHaveBeenCalledWith('cvs_711', file)
    expect(el.querySelector('[role="alert"]').textContent).toContain('older than the current version')
  })

  it('restores an earlier upload; read-only users see no buttons', async () => {
    api.activateTemplate.mockResolvedValue([])
    let el = await mount()
    const restore = [...el.querySelectorAll('button')].find((b) => b.textContent === 'page_shipping_wb.tpl_restore')
    await act(async () => { restore.click() })
    expect(api.activateTemplate).toHaveBeenCalledWith('cvs_711', 4)
    el = await mount(false)
    expect(el.querySelectorAll('button')).toHaveLength(0)
  })
})
