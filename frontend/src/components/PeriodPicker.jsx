import { useState } from 'react'
import { getSharedPeriod, setSharedPeriod } from '../utils/sharedPeriod'
import { useTranslation } from 'react-i18next'
import { jakartaIsoDate } from '../utils/jakartaDate'

// Business Timezone is Asia/Jakarta. All calendar math below is done on the Jakarta calendar date
// (as a UTC-midnight Date, so the browser's own timezone can never shift a day): building
// "1st of the month" with new Date(y, m, 1) in a browser outside UTC+7 and then formatting it in
// Jakarta produced the previous day (e.g. This Month starting on Sep 30).
const isoDate = jakartaIsoDate
function jakartaToday() {
  const [y, m, d] = jakartaIsoDate().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const iso = (d) => d.toISOString().slice(0, 10)
const shiftDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n))
function startOfWeek(d) {
  const day = d.getUTCDay()
  return shiftDays(d, -(day === 0 ? 6 : day - 1))
}
export function daysAgoRange(days) {
  const today = jakartaToday()
  return { from: iso(shiftDays(today, -days)), to: iso(today) }
}
function singleDayRange(daysAgo) {
  const d = iso(shiftDays(jakartaToday(), -daysAgo))
  return { from: d, to: d }
}
export function thisWeekRange() {
  const today = jakartaToday()
  return { from: iso(startOfWeek(today)), to: iso(today) }
}
function lastWeekRange() {
  const thisStart = startOfWeek(jakartaToday())
  return { from: iso(shiftDays(thisStart, -7)), to: iso(shiftDays(thisStart, -1)) }
}
export function thisMonthRange() {
  const today = jakartaToday()
  return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: iso(today) }
}
function lastMonthRange() {
  const today = jakartaToday()
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
  return { from: iso(first), to: iso(last) }
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
  { key: 'all', labelKey: 'page_performance_comparison.date_all_time', allTime: true, range: () => ({ from: '1970-01-01', to: isoDate(new Date()), allTime: true }) },
  { key: 'custom', labelKey: 'shared.date_custom' },
]

// Initial range for a page that uses the shared filter: the stored chip re-evaluated for today
// (so "Today" never goes stale across midnight), or "Today" when nothing was picked yet.
export function initialSharedRange() {
  const s = getSharedPeriod()
  if (!s) return daysAgoRange(0)
  if (s.key === 'custom') return { from: s.from, to: s.to }
  const p = periodPresets.find((x) => x.key === s.key)
  return p?.range ? p.range() : daysAgoRange(0)
}
export function useSharedRange() {
  return useState(initialSharedRange)
}

// Shared period selector (Performance Dashboard layout): Today / Yesterday / 7 / 14 / 30 Days /
// This Week / Last Week / This Month / Last Month / Custom. Emits {from, to} (ISO dates).
//
// Optional extras (used by Custom Performance Comparison groups): `allowAllTime` adds an "All Time"
// chip, `onInherit` adds a leading "Use Page Date" chip (active while `inherited`), and
// `onPresetChange(key)` lets the parent remember the chosen chip across unmounts.
export default function PeriodPicker({ value, onChange, defaultPreset = '7d', shared = false, allowAllTime = false, inherited = false, onInherit, onPresetChange }) {
  const { t } = useTranslation()
  const [active, setActive] = useState(shared ? (getSharedPeriod()?.key ?? 'today') : defaultPreset)
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
    if (shared) setSharedPeriod({ key: preset.key, ...range })
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
          <button onClick={() => { if (shared) setSharedPeriod({ key: 'custom', from: customFrom, to: customTo }); onChange({ from: customFrom, to: customTo }) }} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            {t('shared.apply')}
          </button>
        </div>
      )}
    </div>
  )
}
