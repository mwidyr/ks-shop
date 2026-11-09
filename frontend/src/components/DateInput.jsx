import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { jakartaIsoDate } from '../utils/jakartaDate'
import { intlLocale } from '../utils/employeeUi'

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

// A date field whose calendar follows the selected system language (the browser's own <input type="date"> follows the
// browser's language instead). value / onChange use "YYYY-MM-DD" ('' = empty).
export default function DateInput({ value, onChange, className = '', disabled = false, placeholder = 'YYYY-MM-DD' }) {
  const { t, i18n } = useTranslation()
  const locale = intlLocale(i18n?.language)
  const [open, setOpen] = useState(false)
  const today = jakartaIsoDate()
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 })
  const box = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) setView({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 })
    setOpen(!open)
  }
  const move = (delta) => setView(({ y, m }) => { const d = new Date(Date.UTC(y, m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })
  const pick = (v) => { onChange(v); setOpen(false) }

  const first = new Date(Date.UTC(view.y, view.m, 1))
  const lead = first.getUTCDay()
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toLocaleString(locale, { weekday: 'short', timeZone: 'UTC' })) // Sunday first
  const title = first.toLocaleString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div ref={box} className="relative">
      <input readOnly value={value || ''} placeholder={placeholder} disabled={disabled} onClick={toggle} className={`cursor-pointer ${className}`} />
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-[var(--table-divider)] bg-[var(--table-card-bg)] p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => move(-1)} className="px-2 text-[var(--text-primary)]">‹</button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
            <button type="button" onClick={() => move(1)} className="px-2 text-[var(--text-primary)]">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--text-secondary)] mb-1">{weekdays.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => d == null ? <span key={`b${i}`} /> : (
              <button key={d} type="button" onClick={() => pick(iso(view.y, view.m, d))}
                className={`h-8 rounded-lg text-sm ${iso(view.y, view.m, d) === value ? 'bg-brand-600 text-white' : iso(view.y, view.m, d) === today ? 'border border-brand-600 text-[var(--text-primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--table-row-hover)]'}`}>{d}</button>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs font-semibold">
            <button type="button" onClick={() => pick(today)} className="text-brand-600">{t('shared.date_today')}</button>
            {value && <button type="button" onClick={() => pick('')} className="text-[var(--text-secondary)]">{t('common.clear')}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
