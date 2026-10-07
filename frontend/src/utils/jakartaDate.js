// The business day is Asia/Jakarta (the header clock, Heatmap slots and the backend's date
// filters all use it). Date.toISOString() formats in UTC, so between 00:00 and 07:00 Jakarta time
// it returns YESTERDAY's date - which made "today" filters, and orders created in that window,
// land on the previous day. Always format filter dates through this instead.
const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })

// yyyy-mm-dd of the given instant as a Jakarta calendar date.
export function jakartaIsoDate(d = new Date()) {
  return FORMAT.format(d)
}
