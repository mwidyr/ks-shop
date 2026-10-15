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
