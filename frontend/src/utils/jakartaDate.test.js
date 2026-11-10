import { describe, expect, it } from 'vitest'
import { jakartaDateTime, jakartaDateTimeParts } from './jakartaDate'

describe('jakartaDateTime', () => {
  it('formats in GMT+7 with a 24-hour clock', () => {
    expect(jakartaDateTimeParts('2026-11-09T17:05:09Z')).toEqual({ date: '10/11/2026', time: '00:05:09' })
    expect(jakartaDateTime('2026-11-09T06:30:00Z')).toBe('09/11/2026 13:30:00')
  })
  it('is empty for a missing value', () => {
    expect(jakartaDateTime(null)).toBe('')
  })
})
