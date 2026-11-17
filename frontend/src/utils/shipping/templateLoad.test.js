import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../../api/client', () => ({ default: { get } }))
import { loadTemplateBytes } from './excel'

describe('loadTemplateBytes', () => {
  beforeEach(() => { get.mockReset(); globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)) })) })

  it('uses the uploaded template when there is one', async () => {
    get.mockResolvedValue({ data: new ArrayBuffer(8) })
    const out = await loadTemplateBytes('cvs_711', '/cvs-templates/711.xlsm')
    expect(out.byteLength).toBe(8)
    expect(get).toHaveBeenCalledWith('/shipping-workbench/templates/cvs_711/file', { responseType: 'arraybuffer' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the shipped template on 404 or a network error', async () => {
    get.mockRejectedValue({ response: { status: 404 } })
    expect((await loadTemplateBytes('cvs_711', '/cvs-templates/711.xlsm')).byteLength).toBe(3)
    expect(fetch).toHaveBeenCalledWith('/cvs-templates/711.xlsm')
  })
})
