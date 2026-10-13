// The shop sells in NT$ ("NT$1,280" in the design: no space, comma thousands).
export function money(n) {
  return `NT$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`
}

export function discountPct(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0
  return Math.round((1 - price / compareAt) * 100)
}

const pad = (n) => String(n).padStart(2, '0')
// "MM/DD" (the design's short date) and "MM/DD HH:mm"
export function shortDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}
export function shortDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function clock(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function duration(sec) {
  if (!sec && sec !== 0) return ''
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`
}
export function fullDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}
export const formatNumber = (n) => new Intl.NumberFormat('en-US').format(n || 0)

// Statuses of an order as shown to the customer (backend order status -> tab key)
export const ORDER_TABS = ['all', 'pending', 'processing', 'shipping', 'done', 'return']
export function orderTab(status) {
  switch (status) {
    case 'pending': return 'pending'
    case 'picking': case 'ready_to_ship': return 'processing'
    case 'shipped': return 'shipping'
    case 'delivered': return 'done'
    case 'return': return 'return'
    default: return 'all'
  }
}
