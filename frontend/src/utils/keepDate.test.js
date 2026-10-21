import { describe, it, expect } from 'vitest'
import { keepDates } from './keepDate'

describe('keepDates', () => {
  it('shipping date: exportable 1 day before', () => {
    expect(keepDates('2026-10-30', 'shipping')).toEqual({ ship: '2026-10-30', exportFrom: '2026-10-29' })
  })
  it('expected delivery: ship -3, exportable -4', () => {
    expect(keepDates('2026-10-30', 'delivery')).toEqual({ ship: '2026-10-27', exportFrom: '2026-10-26' })
  })
  it('crosses month and year boundaries', () => {
    expect(keepDates('2027-01-02', 'delivery')).toEqual({ ship: '2026-12-30', exportFrom: '2026-12-29' })
  })
  it('empty date gives null', () => {
    expect(keepDates('', 'delivery')).toBeNull()
  })
})
