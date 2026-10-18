import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cachedLookup, invalidateLookups } from './lookupCache'

describe('lookup cache', () => {
  beforeEach(() => invalidateLookups())

  it('shares one request between callers and keeps the result', async () => {
    const loader = vi.fn(() => Promise.resolve([{ id: 1 }]))
    const [a, b] = await Promise.all([cachedLookup('k', loader), cachedLookup('k', loader)])
    expect(a).toEqual(b)
    await cachedLookup('k', loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })
  it('hands out a copy of a list, so a caller sorting it does not change the cache', async () => {
    const first = await cachedLookup('k', () => Promise.resolve([3, 1, 2]))
    first.sort()
    expect(await cachedLookup('k', () => Promise.resolve([9]))).toEqual([3, 1, 2])
  })
  it('does not keep a failed request', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(['ok'])
    await expect(cachedLookup('k', loader)).rejects.toThrow('x')
    expect(await cachedLookup('k', loader)).toEqual(['ok'])
  })
  it('invalidates by prefix and expires after the ttl', async () => {
    const loader = vi.fn(() => Promise.resolve(['v']))
    await cachedLookup('hosts?a', loader)
    await cachedLookup('chains', loader)
    invalidateLookups('hosts')
    await cachedLookup('hosts?a', loader)
    await cachedLookup('chains', loader)
    expect(loader).toHaveBeenCalledTimes(3) // chains stayed cached
    vi.useFakeTimers()
    await cachedLookup('t', loader, 1000)
    vi.advanceTimersByTime(1500)
    await cachedLookup('t', loader, 1000)
    expect(loader).toHaveBeenCalledTimes(5)
    vi.useRealTimers()
  })
})
