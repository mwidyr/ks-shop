// LIVE times are Taiwan time (UTC+8) for every visitor, whatever their own timezone is.
const TZ = 'Asia/Taipei'

// calendar parts of an instant in Taiwan
function taipeiParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date).map((p) => [p.type, p.value]))
  return { y: +parts.year, m: +parts.month, d: +parts.day, hh: +parts.hour % 24, mm: +parts.minute }
}
const dayNumber = ({ y, m, d }) => Math.round(Date.UTC(y, m - 1, d) / 86400000)

// "malam ini 20:00" / "besok 14:00" / "Sabtu 14:00" for the announced time of a live (Taiwan time).
export function whenLabel(iso, t, lang, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const p = taipeiParts(d)
  const time = `${pad(p.hh)}:${pad(p.mm)}`
  const days = dayNumber(p) - dayNumber(taipeiParts(now))
  if (days === 0) return t(p.hh >= 18 ? 'when.today_evening' : 'when.today', { time })
  if (days === 1) return t('when.tomorrow', { time })
  const day = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-TW' : lang === 'en' ? 'en-US' : 'id-ID', { weekday: 'long', timeZone: TZ }).format(d)
  return t('when.other', { day, time })
}

// "Sat, 25 Oct" and "19:00" in Taiwan time for the upcoming LIVE list
export function liveDateParts(iso, lang) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const locale = lang === 'zh' ? 'zh-TW' : lang === 'en' ? 'en-US' : 'id-ID'
  return {
    date: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(d),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d),
  }
}
