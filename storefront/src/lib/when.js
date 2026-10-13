// "malam ini 20:00" / "besok 14:00" / "Sabtu 14:00" for the announced time of a live.
export function whenLabel(iso, t, lang) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const now = new Date()
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(d) - startOf(now)) / 86400000)
  if (days === 0) return t(d.getHours() >= 18 ? 'when.today_evening' : 'when.today', { time })
  if (days === 1) return t('when.tomorrow', { time })
  const day = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-TW' : lang === 'en' ? 'en-US' : 'id-ID', { weekday: 'long' }).format(d)
  return t('when.other', { day, time })
}
