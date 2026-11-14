import { describe, expect, it } from 'vitest'
import { isIsoDate, parseDateText } from './dateText'

describe('parseDateText', () => {
  it('reads the forms people type', () => {
    for (const v of ['1990-12-25', '1990/12/25', '1990.12.25', '25-12-1990', '25/12/1990', '25.12.1990', '19901225', '25121990', ' 1990-12-25 ']) expect(parseDateText(v)).toBe('1990-12-25')
    expect(parseDateText('5/3/1990')).toBe('1990-03-05')
  })
  it('refuses what is not a real date', () => {
    for (const v of ['', 'abc', '1990-13-01', '1990-02-30', '31/02/1990', '29/02/2023', '1890-01-01', '12-1990', '1990-12']) expect(parseDateText(v)).toBeNull()
    expect(parseDateText('29/02/2024')).toBe('2024-02-29') // a leap day
  })
  it('isIsoDate is strict', () => {
    expect(isIsoDate('1990-12-25')).toBe(true)
    expect(isIsoDate('1990-12-5')).toBe(false)
    expect(isIsoDate('1990-02-30')).toBe(false)
  })
})
