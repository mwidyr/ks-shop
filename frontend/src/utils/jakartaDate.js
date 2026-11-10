// The business day is Asia/Jakarta (the header clock, Heatmap slots and the backend's date
// filters all use it). Date.toISOString() formats in UTC, so between 00:00 and 07:00 Jakarta time
// it returns YESTERDAY's date - which made "today" filters, and orders created in that window,
// land on the previous day. Always format filter dates through this instead.
const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })

// yyyy-mm-dd of the given instant as a Jakarta calendar date.
export function jakartaIsoDate(d = new Date()) {
  return FORMAT.format(d)
}

const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

// "dd/mm/yyyy" and "HH:mm:ss" (24-hour) of the given instant in Jakarta time (GMT+7), whatever the
// browser's own timezone is. Empty strings for a missing / invalid value.
export function jakartaDateTimeParts(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (!value || Number.isNaN(d.getTime())) return { date: '', time: '' }
  const p = Object.fromEntries(DATE_PARTS.formatToParts(d).map((x) => [x.type, x.value]))
  return { date: `${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}:${p.second}` }
}

export function jakartaDateTime(value) {
  const { date, time } = jakartaDateTimeParts(value)
  return date ? `${date} ${time}` : ''
}
