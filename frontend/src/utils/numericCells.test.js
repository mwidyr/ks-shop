// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { isNumericText } from './numericCells'

describe('isNumericText', () => {
  it.each(['12', '1,234', 'NT$ 1,200', '45%', '-3', '12.50', 'Rp. 10.000'])('%s is numeric', (v) => expect(isNumericText(v)).toBe(true))
  it.each(['', 'abc', '0912345678', '2026/10/17', '12 items', '1234567890123'])('%s is not numeric', (v) => expect(isNumericText(v)).toBe(false))
})
