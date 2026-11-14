import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { jakartaIsoDate } from '../utils/jakartaDate'
import { intlLocale } from '../utils/employeeUi'
import { isIsoDate, parseDateText } from '../utils/dateText'

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const MIN_YEAR = 1900

// A date field whose calendar follows the selected system language (the browser's own <input type="date"> follows the
// browser's language instead). value / onChange use "YYYY-MM-DD" ('' = empty).
// The date can be typed (1990-12-25, 25/12/1990 ... see parseDateText) or picked: the calendar has a month and a year
// selector besides the month arrows, so a birth date does not need dozens of clicks. defaultView ("YYYY-MM") is the month
// the calendar opens on while the field is empty (a birth date opens around 30 years back instead of this month).
export default function DateInput({ value, onChange, className = '', disabled = false, placeholder = 'YYYY-MM-DD', defaultView }) {
  const { t, i18n } = useTranslation()
  const locale = intlLocale(i18n?.language)
  const [open, setOpen] = useState(false)
  const today = jakartaIsoDate()
  const hasValue = isIsoDate(value || '')
  const startView = () => {
    const base = hasValue ? value : (/^\d{4}-\d{2}/.test(defaultView || '') ? `${defaultView.slice(0, 7)}-01` : today)
    return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }
  }
  const [view, setView] = useState(startView)
  const [text, setText] = useState(value || '')
  const [invalid, setInvalid] = useState(false)
  const box = useRef(null)

  // the field follows the value (a date picked in the calendar, or set from outside)
  useEffect(() => { setText(value || ''); setInvalid(false) }, [value])

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const show = () => {
    if (disabled || open) return
    setView(startView())
    setOpen(true)
  }
  const move = (delta) => setView(({ y, m }) => { const d = new Date(Date.UTC(y, m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })
  const pick = (v) => { onChange(v); setText(v); setInvalid(false); setOpen(false) }

  function typed(e) {
    const v = e.target.value
    setText(v)
    setInvalid(false)
    // a complete ISO date is taken at once; the other forms are read when the field is left (so "2026-1-1" is not
    // taken while "2026-11-12" is still being typed)
    if (isIsoDate(v)) { onChange(v); setView({ y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)) - 1 }) }
  }
  function commit() {
    const v = text.trim()
    if (v === '') { if (value) onChange(''); setInvalid(false); return }
    const parsed = parseDateText(v)
    if (parsed) {
      if (parsed !== value) onChange(parsed)
      setText(parsed)
      setView({ y: Number(parsed.slice(0, 4)), m: Number(parsed.slice(5, 7)) - 1 })
      setInvalid(false)
    } else {
      setText(value || '') // not a real date: the previous value stays
      setInvalid(true)
    }
  }

  const first = new Date(Date.UTC(view.y, view.m, 1))
  const lead = first.getUTCDay()
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toLocaleString(locale, { weekday: 'short', timeZone: 'UTC' })) // Sunday first
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2023, i, 1)).toLocaleString(locale, { month: 'long', timeZone: 'UTC' }))
  const thisYear = Number(today.slice(0, 4))
  const topYear = Math.max(thisYear + 10, view.y)
  const years = Array.from({ length: topYear - Math.min(MIN_YEAR, view.y) + 1 }, (_, i) => topYear - i)
  const selectCls = 'rounded-lg border border-[var(--table-divider)] bg-[var(--table-card-bg)] px-1.5 py-1 text-sm font-semibold text-[var(--text-primary)]'

  return (
    <div ref={box} className="relative">
      <input
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onFocus={show}
        onClick={show}
        onChange={typed}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); setOpen(false) }
          if (e.key === 'Escape') setOpen(false)
        }}
        className={`${className} ${invalid ? 'border-red-400' : ''}`}
      />
      {invalid && <p className="text-[11px] text-red-600 mt-0.5">{t('shared.date_invalid')}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-[var(--table-divider)] bg-[var(--table-card-bg)] p-3 shadow-xl">
          <div className="flex items-center justify-between gap-1 mb-2">
            <button type="button" onClick={() => move(-1)} aria-label={t('shared.date_prev_month')} className="px-2 text-[var(--text-primary)]">‹</button>
            <select aria-label={t('shared.date_month')} value={view.m} onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))} className={selectCls}>
              {months.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
            <select aria-label={t('shared.date_year')} value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))} className={selectCls}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={() => move(1)} aria-label={t('shared.date_next_month')} className="px-2 text-[var(--text-primary)]">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--text-secondary)] mb-1">{weekdays.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => d == null ? <span key={`b${i}`} /> : (
              <button key={d} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(iso(view.y, view.m, d))}
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
