// +886912345678 / 886912345678 / 0912-345-678 -> 0912345678 (the local format used by the ERP and shipping exports).
// Anything that is not a Taiwan number only loses its separators.
export const normPhone = (s) => {
  const p = String(s || '').replace(/[\s().-]/g, '')
  const m = p.match(/^(?:\+|00)?886(0?)(9\d{8})$/)
  return m ? `0${m[2]}` : p
}

export const isTwMobile = (s) => /^09\d{8}$/.test(normPhone(s))
