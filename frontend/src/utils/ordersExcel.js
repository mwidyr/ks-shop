// Excel export of the Order Management list: the same orders the filters on the page select (all pages,
// not just the one on screen), one row per order. Phone numbers and store codes are written as text so
// leading zeros survive.
import { jakartaDateTime } from './jakartaDate'

export const ORDER_EXPORT_MAX = 10000 // orders per file; the page says so when the filters match more

// [i18n key under page_orders, value of an order]
export const ORDER_COLUMNS = [
  ['xl_order_no', (o) => o.order_no],
  ['xl_status', (o, t) => t(`status.${o.status}`, o.status)],
  ['xl_date', (o) => jakartaDateTime(o.created_at)],
  ['xl_customer', (o) => o.customer_name],
  ['xl_phone', (o) => String(o.customer_phone || '')],
  ['xl_delivery', (o) => o.pickup_chain_name],
  ['xl_store', (o) => o.pickup_store_name],
  ['xl_store_code', (o) => String(o.pickup_store_code || '')],
  ['xl_address', (o) => (['cvs_711', 'cvs_familymart'].includes(o.pickup_chain_type) ? '' : o.shipping_address || '')],
  ['xl_qty', (o) => Number(o.total_qty) || 0],
  ['xl_total', (o) => Number(o.total) || 0],
  ['xl_source', (o, t) => (o.source && o.source !== 'staff' ? t(`page_orders.source_${o.source}`, o.source) : 'Staff')],
  ['xl_products', (o) => (o.items || []).map((i) => `${i.sku} ×${i.qty}${i.name ? ` ${i.name}` : ''}`).join('; ')],
  ['xl_flags', (o, t) => [o.is_urgent && t('page_orders.xl_urgent'), o.customer_blacklisted && t('page_orders.xl_blacklist'), o.is_merged && t('page_orders.xl_merged')].filter(Boolean).join(', ')],
  ['xl_keep_date', (o) => o.keep_date || ''],
]

export function orderSheetData(orders, t) {
  return [
    ORDER_COLUMNS.map(([key]) => t(`page_orders.${key}`)),
    ...orders.map((o) => ORDER_COLUMNS.map(([, get]) => get(o, t))),
  ]
}

export const ORDER_COL_WIDTHS = [22, 14, 20, 22, 16, 18, 26, 12, 40, 8, 14, 20, 60, 20, 16]

export async function buildOrdersWorkbookBlob(orders, t) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(orderSheetData(orders, t))
  ws['!cols'] = ORDER_COL_WIDTHS.map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orders')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ---- orders short of stock: date, order number(s), missing SKU, quantities ----
export const SHORTAGE_COLUMNS = [
  ['xs_date', (l) => l.created_at],
  ['xs_order_no', (l) => l.order_no],
  ['xs_delivery', (l) => l.delivery],
  ['xs_sku', (l) => l.sku],
  ['xs_ordered', (l) => Number(l.ordered) || 0],
  ['xs_available', (l) => Number(l.available) || 0],
  ['xs_short', (l) => Number(l.short) || 0],
]

export function shortageSheetData(lines, t) {
  return [SHORTAGE_COLUMNS.map(([key]) => t(`page_orders.${key}`)), ...lines.map((l) => SHORTAGE_COLUMNS.map(([, get]) => get(l)))]
}

export async function buildShortageWorkbookBlob(lines, t) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(shortageSheetData(lines, t))
  ws['!cols'] = [18, 30, 18, 26, 10, 12, 10].map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Insufficient stock')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
