// Limits of the logistics providers' own import files (7-ELEVEN, FamilyMart, HCT). The backend
// enforces the same rules (handlers/export_rules.go) - keep both in sync.

export const EXPORT_NAME_MAX_UNITS = 10 // 10 English characters or 5 Chinese characters
export const EXPORT_ADDRESS_MAX_CHARS = 50 // HCT (POS home delivery) address
export const HCT_ORDER_NO_MAX = 20

const CJK = /[\p{Script=Han}　-〿＀-￯]/u

// Length of a name in "English character" units: a Chinese character counts as two.
export function nameUnits(name) {
  let n = 0
  for (const ch of String(name || '')) n += CJK.test(ch) ? 2 : 1
  return n
}

export function nameTooLong(name) {
  return nameUnits(name) > EXPORT_NAME_MAX_UNITS
}

export function addressTooLong(address) {
  return [...String(address || '')].length > EXPORT_ADDRESS_MAX_CHARS
}

// HCT order id: at most 20 characters, no Chinese.
export function hctOrderNoValid(orderNo) {
  const s = String(orderNo || '')
  return s.length > 0 && s.length <= HCT_ORDER_NO_MAX && !CJK.test(s)
}

// ---- Export-time validation (Export File Adjustments.pdf) ----------------------------------
// Each check returns an error key (+ params) for the row's problems; a row with any error is shown
// in red in the export dialog and cannot be selected/exported, whatever tab (new or re-export) it is in.

export const EXPORT_TOTAL_MAX = 20000

function phoneOk(phone) {
  return /^09\d{8}$/.test(String(phone || '').replace(/\D/g, ''))
}

// Rows are the /shipping-export rows. `kind` is 'cvs_711' | 'cvs_familymart' | 'courier'.
export function exportErrors(r, kind) {
  const errs = []
  if (!String(r.customer_name || '').trim()) errs.push({ key: 'name_missing' })
  else if (nameTooLong(r.customer_name)) errs.push({ key: 'name', params: { units: nameUnits(r.customer_name) } })
  if (!String(r.order_no || '').trim()) errs.push({ key: 'order_no' })

  if (kind === 'courier') {
    if (!hctOrderNoValid(r.order_no)) errs.push({ key: 'order_no' })
    if (!String(r.shipping_address || '').trim()) errs.push({ key: 'address_missing' })
    else if (addressTooLong(r.shipping_address)) errs.push({ key: 'address_long', params: { count: [...r.shipping_address].length } })
    if (!String(r.customer_phone || '').trim()) errs.push({ key: 'phone' })
  } else {
    if (!phoneOk(r.customer_phone)) errs.push({ key: 'phone' })
    if (!/^\d{6}$/.test(String(r.pickup_store_code || ''))) errs.push({ key: 'store' })
  }
  const total = Number(r.item_value || 0) + Number(r.shipping_fee || 0)
  if (total > EXPORT_TOTAL_MAX) errs.push({ key: 'total', params: { total } })
  return errs
}
