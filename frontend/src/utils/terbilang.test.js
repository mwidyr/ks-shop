import { describe, it, expect } from 'vitest'
import { terbilang } from './employeeUi'

describe('terbilang', () => {
  it('spells rupiah amounts in Indonesian', () => {
    expect(terbilang(12500000)).toBe('Dua Belas Juta Lima Ratus Ribu Rupiah')
    expect(terbilang(500000)).toBe('Lima Ratus Ribu Rupiah')
    expect(terbilang(1000)).toBe('Seribu Rupiah')
    expect(terbilang(2111000)).toBe('Dua Juta Seratus Sebelas Ribu Rupiah')
    expect(terbilang(0)).toBe('Nol Rupiah')
  })
})
