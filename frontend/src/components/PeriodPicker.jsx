import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { jakartaIsoDate } from '../utils/jakartaDate'

// Business Timezone is Asia/Jakarta (confirmed by the client's own HeatMap tab) - day-boundary
// math here follows the same plain-local-date convention every other date picker in this app
// already uses (DateRangePicker.jsx), not a page-specific timezone conversion.
const isoDate = jakartaIsoDate
function startOfWeek(d) {
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  const start = new Date(d)
  start.setDate(start.getDate() - diff)
  return start
}
export function daysAgoRange(days) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: isoDate(from), to: isoDate(to) }
}
function singleDayRange(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { from: isoDate(d), to: isoDate(d) }
}
function thisWeekRange() {
  const now = new Date()
  return { from: isoDate(startOfWeek(now)), to: isoDate(now) }
}
function lastWeekRange() {
  const thisStart = startOfWeek(new Date())
  const lastEnd = new Date(thisStart)
  lastEnd.setDate(lastEnd.getDate() - 1)
  const lastStart = new Date(lastEnd)
  lastStart.setDate(lastStart.getDate() - 6)
  return { from: isoDate(lastStart), to: isoDate(lastEnd) }
}
function thisMonthRange() {
  const now = new Date()
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }
}
function lastMonthRange() {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: isoDate(new Date(end.getFullYear(), end.getMonth(), 1)), to: isoDate(end) }
}

const periodPresets = [
  { key: 'today', labelKey: 'shared.date_today', range: () => daysAgoRange(0) },
  { key: 'yesterday', labelKey: 'shared.date_yesterday', range: () => singleDayRange(1) },
  { key: '7d', labelKey: 'shared.date_7d', range: () => daysAgoRange(6) },
  { key: '14d', labelKey: 'shared.date_14d', range: () => daysAgoRange(13) },
  { key: '30d', labelKey: 'shared.date_30d', range: () => daysAgoRange(29) },
  { key: 'this_week', labelKey: 'page_performance_dashboard.period_this_week', range: thisWeekRange },
  { key: 'last_week', labelKey: 'page_performance_dashboard.period_last_week', range: lastWeekRange },
  { key: 'this_month', labelKey: 'page_performance_dashboard.period_this_month', range: thisMonthRange },
  { key: 'last_month', labelKey: 'page_performance_dashboard.period_last_month', range: lastMonthRange },
  { key: 'all', labelKey: 'page_performance_comparison.date_all_time', allTime: true, range: () => ({ from: '', to: '', allTime: true }) },
  { key: 'custom', labelKey: 'shared.date_custom' },
]

// Shared period selector (Performance Dashboard layout): Today / Yesterday / 7 / 14 / 30 Days /
// This Week / Last Week / This Month / Last Month / Custom. Emits {from, to} (ISO dates).
//
// Optional extras (used by Custom Performance Comparison groups): `allowAllTime` adds an "All Time"
// chip, `onInherit` adds a leading "Use Page Date" chip (active while `inherited`), and
// `onPresetChange(key)` lets the parent remember the chosen chip across unmounts.
export default function PeriodPicker({ value, onChange, defaultPreset = '7d', allowAllTime = false, inherited = false, onInherit, onPresetChange }) {
  const { t } = useTranslation()
  const [active, setActive] = useState(defaultPreset)
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)
  const shown = inherited ? 'inherit' : active
  const presets = allowAllTime ? periodPresets : periodPresets.filter((p) => !p.allTime)

  function selectPreset(preset) {
    setActive(preset.key)
    onPresetChange?.(preset.key)
    if (preset.key === 'custom') return
    const range = preset.range()
    setCustomFrom(range.from)
    setCustomTo(range.to)
    onChange(range)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onInherit && (
        <button
          onClick={() => { onPresetChange?.('inherit'); onInherit() }}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
            shown === 'inherit' ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('page_performance_comparison.use_page_date')}
        </button>
      )}
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => selectPreset(p)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
            shown === p.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t(p.labelKey)}
        </button>
      ))}
      {shown === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-gray-400 text-sm">{t('shared.date_range_separator')}</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={() => onChange({ from: customFrom, to: customTo })} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            {t('shared.apply')}
          </button>
        </div>
      )}
    </div>
  )
}
