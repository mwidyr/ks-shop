// Shared helpers for the EMPLOYEE pages.
import { jakartaIsoDate } from './jakartaDate'

export const currentMonth = () => jakartaIsoDate().slice(0, 7)

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// The app language ('id' | 'en' | 'zh') as an Intl locale, so month / weekday names follow the selected system language.
export const intlLocale = (lang) => ({ id: 'id-ID', en: 'en-US', zh: 'zh-TW' }[String(lang || 'id').slice(0, 2)] || 'id-ID')

export function monthLabel(month, lang = 'en') {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(intlLocale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const fmtIDR = (n) => Math.round(Number(n) || 0).toLocaleString('en-US')
export const fmtRp = (n) => `Rp ${fmtIDR(n)}`

export const EMPLOYEE_STATUSES = [['full_time', 'Full-time'], ['probationary', 'Probationary'], ['resigned', 'Resigned'], ['fired', 'Fired']]
// Soft translucent tint per employment status (rgba works on both the light and the dark theme).
export const EMPLOYEE_STATUS_COLOR = { full_time: '16, 185, 129', probationary: '245, 158, 11', resigned: '100, 116, 139', fired: '220, 38, 38' }
export const employeeRowStyle = (s) => (EMPLOYEE_STATUS_COLOR[s] ? { backgroundColor: `rgba(${EMPLOYEE_STATUS_COLOR[s]}, 0.10)` } : undefined)
export const employeeDotStyle = (s) => ({ backgroundColor: `rgb(${EMPLOYEE_STATUS_COLOR[s] || '148, 163, 184'})` })
export const statusLabel = (s) => EMPLOYEE_STATUSES.find(([k]) => k === s)?.[1] || s
export const MBTI_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']

// Attendance status colors: the settings store a color name for the background and one for the text.
export const STATUS_COLORS = {
  green: { label: 'Green', bg: '#dcfce7', fg: '#166534' },
  blue: { label: 'Blue', bg: '#e0e7ff', fg: '#3730a3' },
  red: { label: 'Red', bg: '#fee2e2', fg: '#b91c1c' },
  yellow: { label: 'Yellow', bg: '#fef3c7', fg: '#b45309' },
  gray: { label: 'Gray', bg: '#e5e7eb', fg: '#374151' },
  purple: { label: 'Purple', bg: '#f3e8ff', fg: '#6b21a8' },
  orange: { label: 'Orange', bg: '#ffedd5', fg: '#c2410c' },
  teal: { label: 'Teal', bg: '#ccfbf1', fg: '#0f766e' },
  brown: { label: 'Brown', bg: '#e7d5c3', fg: '#78350f' },
  black: { label: 'Black', bg: '#374151', fg: '#111827' },
  white: { label: 'White', bg: '#ffffff', fg: '#ffffff' },
}
export const statusStyle = (s) => ({
  backgroundColor: STATUS_COLORS[s?.bg_color]?.bg || '#e5e7eb',
  color: STATUS_COLORS[s?.text_color]?.fg || '#374151',
})

// Indonesian "terbilang" (amount in words) for the payslip: 12500000 -> "Dua Belas Juta Lima Ratus Ribu Rupiah".
const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas']
function terbilangInt(n) {
  if (n < 12) return SATUAN[n]
  if (n < 20) return `${terbilangInt(n - 10)} Belas`
  if (n < 100) return `${terbilangInt(Math.floor(n / 10))} Puluh${n % 10 ? ` ${terbilangInt(n % 10)}` : ''}`
  if (n < 200) return `Seratus${n > 100 ? ` ${terbilangInt(n - 100)}` : ''}`
  if (n < 1000) return `${terbilangInt(Math.floor(n / 100))} Ratus${n % 100 ? ` ${terbilangInt(n % 100)}` : ''}`
  if (n < 2000) return `Seribu${n > 1000 ? ` ${terbilangInt(n - 1000)}` : ''}`
  if (n < 1e6) return `${terbilangInt(Math.floor(n / 1000))} Ribu${n % 1000 ? ` ${terbilangInt(n % 1000)}` : ''}`
  if (n < 1e9) return `${terbilangInt(Math.floor(n / 1e6))} Juta${n % 1e6 ? ` ${terbilangInt(n % 1e6)}` : ''}`
  if (n < 1e12) return `${terbilangInt(Math.floor(n / 1e9))} Miliar${n % 1e9 ? ` ${terbilangInt(n % 1e9)}` : ''}`
  return String(n)
}
export function terbilang(amount) {
  const n = Math.round(Number(amount) || 0)
  if (n === 0) return 'Nol Rupiah'
  return `${n < 0 ? 'Minus ' : ''}${terbilangInt(Math.abs(n))} Rupiah`
}
