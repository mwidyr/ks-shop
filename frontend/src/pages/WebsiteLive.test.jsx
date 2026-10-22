// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const api = vi.hoisted(() => ({
  getLiveSettings: vi.fn(), saveLiveShift: vi.fn(() => Promise.resolve({})), saveLiveLocation: vi.fn(() => Promise.resolve({})),
  saveLiveUrl: vi.fn(() => Promise.resolve({})), endLive: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../api/website', () => api)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o?.name ? `${k}:${o.name}` : k) }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import WebsiteLive from './WebsiteLive'

const settings = {
  shifts: [
    { shift: 'morning', ranges: [['07:00', '10:00'], ['13:00', '16:00']] },
    { shift: 'middle', ranges: [['10:00', '13:00'], ['16:00', '19:00']] },
    { shift: 'evening', ranges: [] },
  ],
  locations: [{ id: 1, name: 'Studio A', work_days: [0, 1, 2, 3, 4, 5], days_off: [{ date: '2026-12-25', note: 'Christmas' }] }],
  hosts: [
    { id: 10, name: 'Rara', location_id: 1, location: 'Studio A', shift: 'morning', live_url: 'https://www.tiktok.com/@rara/live', status: 'live', window_end: '2026-10-23T10:00:00+08:00' },
    { id: 11, name: 'Lala', location_id: 1, location: 'Studio A', shift: 'evening', live_url: '', status: 'offline', next_at: '2026-10-25T19:00:00+08:00' },
    { id: 12, name: 'Nono', location_id: 1, location: 'Studio A', shift: '', live_url: '', status: 'offline' },
  ],
}

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<WebsiteLive />) })
  await act(async () => { await Promise.resolve() })
  return el
}
const setValue = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }))
})
const buttons = (el, text) => [...el.querySelectorAll('button')].filter((b) => b.textContent.includes(text))

describe('WebsiteLive', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getLiveSettings.mockResolvedValue(settings); window.confirm = vi.fn(() => true) })

  it('shows the three shifts with their default hours and the host table', async () => {
    const el = await mount()
    expect(el.querySelectorAll('[data-testid^="shift-"]')).toHaveLength(3)
    expect(el.querySelector('[data-testid="shift-morning"] input[type=time]').value).toBe('07:00')
    expect(el.textContent).toContain('Rara')
    expect(el.textContent).toContain('page_website.live.no_shift') // Nono has no shift
  })

  it('Save as Default sends the edited ranges of that shift', async () => {
    const el = await mount()
    const card = el.querySelector('[data-testid="shift-evening"]')
    await act(async () => { buttons(card, 'add_range')[0].click() })
    const times = card.querySelectorAll('input[type=time]')
    await setValue(times[0], '19:00'); await setValue(times[1], '22:00')
    await act(async () => { buttons(card, 'save_default')[0].click() })
    expect(api.saveLiveShift).toHaveBeenCalledWith('evening', [['19:00', '22:00']])
  })

  it('saving a location sends the weekdays and the days off', async () => {
    const el = await mount()
    const loc = el.querySelector('[data-testid="loc-1"]')
    const sat = [...loc.querySelectorAll('label')].find((x) => x.textContent.includes('day_6')).querySelector('input')
    await act(async () => { sat.click() })
    await act(async () => { buttons(loc, 'page_website.live.save')[0].click() })
    expect(api.saveLiveLocation).toHaveBeenCalledWith(1, { work_days: [0, 1, 2, 3, 4, 5, 6], days_off: [{ date: '2026-12-25', note: 'Christmas' }] })
  })

  it('saves a changed LIVE URL on blur and only enables End LIVE for a host that is live', async () => {
    const el = await mount()
    const rows = [...el.querySelectorAll('tbody tr')]
    const rara = rows.find((r) => r.textContent.includes('Rara')); const lala = rows.find((r) => r.textContent.includes('Lala'))
    expect(buttons(rara, 'end_live')[0].disabled).toBe(false)
    expect(buttons(lala, 'end_live')[0].disabled).toBe(true)
    const input = lala.querySelector('input')
    await setValue(input, 'https://www.tiktok.com/@lala/live')
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(api.saveLiveUrl).toHaveBeenCalledWith(11, 'https://www.tiktok.com/@lala/live')
    await act(async () => { buttons(rara, 'end_live')[0].click() })
    expect(api.endLive).toHaveBeenCalledWith(10)
  })
})
