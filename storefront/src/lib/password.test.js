import { describe, it, expect } from 'vitest'
import { passwordError } from './password'

describe('passwordError', () => {
  it('accepts 8+ characters', () => {
    expect(passwordError('longenough')).toBe('')
    expect(passwordError('密碼密碼密碼密碼')).toBe('')
  })
  it('refuses short or blank ones', () => {
    expect(passwordError('')).toBe('short')
    expect(passwordError('        ')).toBe('short')
    expect(passwordError('abc1234')).toBe('short')
  })
  it('refuses more than 72 bytes (bcrypt would cut it)', () => {
    expect(passwordError('a'.repeat(73))).toBe('long')
    expect(passwordError('a'.repeat(72))).toBe('')
  })
})
