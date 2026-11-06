// Shared helpers for the EMPLOYEE pages.
import { jakartaIsoDate } from './jakartaDate'

export const currentMonth = () => jakartaIsoDate().slice(0, 7)

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const fmtIDR = (n) => Math.round(Number(n) || 0).toLocaleString('en-US')
export const fmtRp = (n) => `Rp ${fmtIDR(n)}`

export const EMPLOYEE_STATUSES = [['full_time', 'Full-time'], ['probationary', 'Probationary'], ['resigned', 'Resigned'], ['fired', 'Fired']]
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
