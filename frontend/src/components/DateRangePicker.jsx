import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

const presets = [
  { key: 'yesterday', labelKey: 'shared.date_yesterday', single: 1 },
  { key: 'today', labelKey: 'shared.date_today', days: 0 },
  { key: '7d', labelKey: 'shared.date_7d', days: 6 },
  { key: '14d', labelKey: 'shared.date_14d', days: 13 },
  { key: '30d', labelKey: 'shared.date_30d', days: 29 },
  { key: 'custom', labelKey: 'shared.date_custom' },
]

export function presetRange(days) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: isoDate(from), to: isoDate(to) }
}

// A single day N days back (e.g. "Kemarin" = singleDayRange(1)), as opposed to presetRange's
// trailing window from N days back through today.
export function singleDayRange(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { from: isoDate(d), to: isoDate(d) }
}

// Controlled date-range selector: emits {from, to} (ISO yyyy-mm-dd) via onChange.
export default function DateRangePicker({ value, onChange }) {
  const { t } = useTranslation()
  const [active, setActive] = useState('7d')
  const [customFrom, setCustomFrom] = useState(value?.from || presetRange(6).from)
  const [customTo, setCustomTo] = useState(value?.to || presetRange(6).to)

  useEffect(() => {
    if (!value) onChange(presetRange(6))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectPreset(preset) {
    setActive(preset.key)
    if (preset.key === 'custom') return
    const range = preset.single != null ? singleDayRange(preset.single) : presetRange(preset.days)
    setCustomFrom(range.from)
    setCustomTo(range.to)
    onChange(range)
  }

  function applyCustom() {
    onChange({ from: customFrom, to: customTo })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => selectPreset(p)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
            active === p.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t(p.labelKey)}
        </button>
      ))}
      {active === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <span className="text-gray-400 text-sm">{t('shared.date_range_separator')}</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <button
            onClick={applyCustom}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
          >
            {t('shared.apply')}
          </button>
        </div>
      )}
    </div>
  )
}
