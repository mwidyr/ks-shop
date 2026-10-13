// Orders placed from this device (guest mode has no account). The phone is the shared secret the
// backend uses to show an order, so it is kept next to the order number.
const KEY = 'ralulu_orders_v1'

export function listLocalOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}
export function saveLocalOrder(o) {
  const cur = listLocalOrders().filter((x) => x.orderNo !== o.orderNo)
  try { localStorage.setItem(KEY, JSON.stringify([{ ...o, savedAt: Date.now() }, ...cur].slice(0, 30))) } catch { /* ignore */ }
}
