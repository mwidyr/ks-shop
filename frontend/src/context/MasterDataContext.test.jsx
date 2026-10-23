import { describe, expect, it } from 'vitest'
import { findMaster } from './MasterDataContext'

const colors = [
  { name_zh: '霧藍', name_id: 'Biru Abu Abu', name_en: 'Dusty Blue' },
  { name_zh: '灰', name_id: 'Abu' },
  { name_zh: '奶奶灰', name_id: 'abu-abu susu' },
]

describe('findMaster', () => {
  it('matches regardless of case and extra spaces', () => {
    expect(findMaster(colors, 'Biru abu abu').name_zh).toBe('霧藍')
    expect(findMaster(colors, '  BIRU ABU  ABU ').name_zh).toBe('霧藍')
    expect(findMaster(colors, 'abu').name_zh).toBe('灰')
  })
  it('still matches the Chinese name and exact text', () => {
    expect(findMaster(colors, '霧藍').name_id).toBe('Biru Abu Abu')
    expect(findMaster(colors, 'abu-abu susu').name_zh).toBe('奶奶灰')
  })
  it('matches the English name too', () => {
    expect(findMaster(colors, 'Dusty Blue').name_zh).toBe('霧藍')
    expect(findMaster(colors, ' dusty  BLUE').name_zh).toBe('霧藍')
  })
  it('does not match different words or empty text', () => {
    expect(findMaster(colors, 'Biru')).toBeUndefined()
    expect(findMaster(colors, '  ')).toBeUndefined()
  })
})
