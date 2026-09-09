import { useEffect, useState } from 'react'

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

const presets = [
  { key: 'today', label: 'Hari Ini', days: 0 },
  { key: '7d', label: '7 Hari', days: 6 },
  { key: '30d', label: '30 Hari', days: 29 },
  { key: 'custom', label: 'Custom' },
]

export function presetRange(days) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: isoDate(from), to: isoDate(to) }
}

// Controlled date-range selector: emits {from, to} (ISO yyyy-mm-dd) via onChange.
export default function DateRangePicker({ value, onChange }) {
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
    const range = presetRange(preset.days)
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
          {p.label}
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
          <span className="text-gray-400 text-sm">s/d</span>
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
            Terapkan
          </button>
        </div>
      )}
    </div>
  )
}
