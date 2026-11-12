import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanWaUrl, stripEmoji, waUrl } from './wa'

const ua = (s) => vi.stubGlobal('navigator', { userAgent: s })
afterEach(() => vi.unstubAllGlobals())

describe('WhatsApp emoji', () => {
  it('stripEmoji removes pictographs and tidies spaces, keeping text, x and prices', () => {
    expect(stripEmoji('Hi Ralulu 👋 aku mau beli')).toBe('Hi Ralulu aku mau beli')
    expect(stripEmoji('⏳ BELUM CHECKOUT\n\nHi Ralulu👋 ok\nC023 - TEE × 1')).toBe('BELUM CHECKOUT\n\nHi Ralulu ok\nC023 - TEE × 1')
    expect(stripEmoji('✅ 訂單已成立')).toBe('訂單已成立')
  })
  it('keeps emoji on a phone and removes them on a computer', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')
    expect(decodeURIComponent(waUrl('886', 'Hi 👋'))).toContain('👋')
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')
    expect(decodeURIComponent(waUrl('886', 'Hi 👋'))).toBe('https://wa.me/886?text=Hi')
    expect(decodeURIComponent(cleanWaUrl('https://wa.me/886?text=Hi%20%F0%9F%91%8B%20there'))).toBe('https://wa.me/886?text=Hi there')
  })
})
