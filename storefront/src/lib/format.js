// The business sells in NT$ (see the client's order-copy format: "NT$ 1.234").
export function money(n) {
  return `NT$ ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`
}

export function discountPct(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0
  return Math.round((1 - price / compareAt) * 100)
}

export function promoLabel(p) {
  const min = p.min_order_amount > 0 ? ` min. belanja ${money(p.min_order_amount)}` : ''
  if (p.type === 'free_shipping') return `Gratis Ongkir${min}`
  if (p.type === 'percentage') return `Diskon ${p.value}%${min}`
  return `Diskon ${money(p.value)}${min}`
}

export const STATUS_LABEL = {
  pending: 'Pesanan diterima',
  picking: 'Sedang disiapkan',
  ready_to_ship: 'Siap dikirim',
  shipped: 'Dalam pengiriman',
  delivered: 'Selesai',
  cancelled: 'Dibatalkan',
  return: 'Retur',
}
