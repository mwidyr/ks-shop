// LIVE times are Taiwan time (UTC+8) everywhere, whatever the browser's own timezone is.
export const TAIPEI = 'Asia/Taipei'

export function formatTaipei(iso, locale = 'en-GB') {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale, { timeZone: TAIPEI, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function formatTaipeiTime(iso, locale = 'en-GB') {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale, { timeZone: TAIPEI, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

// "07:00" <-> minutes, for validation before saving a shift
export const toMinutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
export const rangesValid = (ranges) => ranges.every(([a, b]) => toMinutes(a) != null && toMinutes(b) != null && toMinutes(a) !== toMinutes(b))
