import { describe, it, expect } from 'vitest'
import { analyzeScreenshots, secondsToMMSS, mmssToSeconds } from './liveData'

const pen = { url: 'p.png', status: 'done', data: { tab: 'penonton', views: 772, uv: 665, active_viewers: 19, awt_seconds: 37, pcu: 8, acu: 2, live_duration_seconds: 10260 } }
const eng = { url: 'e.png', status: 'done', data: { tab: 'engagement', follows: 12, chats: 91, shares: 1, likes: 468, live_duration_seconds: 10260 } }

describe('analyzeScreenshots', () => {
  it('merges the two tabs in any order and is ready', () => {
    for (const list of [[pen, eng], [eng, pen]]) {
      const a = analyzeScreenshots(list)
      expect(a.ready).toBe(true)
      expect(a.merged).toMatchObject({ views: 772, uv: 665, awt_seconds: 37, follows: 12, chats: 91, shares: 1, likes: 468, live_duration_seconds: 10260 })
      expect(a.saveUrls).toEqual(['p.png', 'e.png'])
    }
  })
  it('waits while an image is still being read', () => {
    const a = analyzeScreenshots([pen, { url: 'e.png', status: 'reading' }])
    expect(a.busy).toBe(true)
    expect(a.ready).toBe(false)
  })
  it('reports a missing tab', () => {
    const a = analyzeScreenshots([pen])
    expect(a.ready).toBe(false)
    expect(a.missing).toEqual(['engagement'])
  })
  it('flags a duplicate tab and an unrecognised image', () => {
    const dup = analyzeScreenshots([pen, { ...pen, url: 'p2.png' }])
    expect(dup.ready).toBe(false)
    expect(dup.problems).toEqual([{ code: 'duplicate_penonton', urls: ['p.png', 'p2.png'] }])
    const odd = analyzeScreenshots([pen, eng, { url: 'b.png', status: 'done', data: { tab: 'other' } }])
    expect(odd.ready).toBe(false)
    expect(odd.problems[0]).toEqual({ code: 'not_recognised', urls: ['b.png'] })
  })
  it('deleting the wrong image fixes the set', () => {
    const odd = [pen, eng, { url: 'b.png', status: 'done', data: { tab: 'other' } }]
    expect(analyzeScreenshots(odd.filter((i) => i.url !== 'b.png')).ready).toBe(true)
  })
  it('falls back to manual entry when the AI could not read 2 images', () => {
    const a = analyzeScreenshots([{ url: 'a.png', status: 'done' }, { url: 'b.png', status: 'done' }])
    expect(a.ready).toBe(false)
    expect(a.manual).toBe(true)
    expect(a.saveUrls).toEqual(['a.png', 'b.png'])
  })
  it('mm:ss helpers', () => {
    expect(secondsToMMSS(37)).toBe('0:37')
    expect(mmssToSeconds('1:06')).toBe(66)
  })
})
