// Keep-order date modes (mirror of backend handlers/keep_date.go):
//  - shipping: ship on the date, exportable 1 day before it.
//  - delivery: expected delivery date; ship 3 days earlier, exportable 4 days before it.
const DAY = 24 * 60 * 60 * 1000

function shift(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY)
  return t.toISOString().slice(0, 10)
}

export function keepDates(dateStr, type) {
  if (!dateStr) return null
  if (type === 'delivery') return { ship: shift(dateStr, -3), exportFrom: shift(dateStr, -4) }
  return { ship: dateStr, exportFrom: shift(dateStr, -1) }
}
