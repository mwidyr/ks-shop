import { describe, it, expect } from 'vitest'
import { exportSku } from './exportSku'

describe('exportSku', () => {
  it('removes every hyphen', () => {
    expect(exportSku('P023-KHAKI-L')).toBe('P023KHAKIL')
  })
  it('leaves a code without hyphens and empty values alone', () => {
    expect(exportSku('P023')).toBe('P023')
    expect(exportSku(null)).toBe('')
    expect(exportSku(undefined)).toBe('')
  })
})
