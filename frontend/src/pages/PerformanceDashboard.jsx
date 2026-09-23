import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPerformanceSummary, getHostRanking, getPerformanceData } from '../api/performanceDashboard'
import { listLocations } from '../api/hostLocations'
import { formatCurrency } from '../utils/format'

// Business Timezone is Asia/Jakarta (confirmed by the client's own HeatMap tab) - day-boundary
// math here follows the same plain-local-date convention every other date picker in this app
// already uses (DateRangePicker.jsx), not a page-specific timezone conversion.
function isoDate(d) {
  return d.toISOString().slice(0, 10)
}
function startOfWeek(d) {
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  const start = new Date(d)
  start.setDate(start.getDate() - diff)
  return start
}
function daysAgoRange(days) {
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
  { key: 'custom', labelKey: 'shared.date_custom' },
]

function PeriodPicker({ value, onChange }) {
  const { t } = useTranslation()
  const [active, setActive] = useState('7d')
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)

  function selectPreset(preset) {
    setActive(preset.key)
    if (preset.key === 'custom') return
    const range = preset.range()
    setCustomFrom(range.from)
    setCustomTo(range.to)
    onChange(range)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {periodPresets.map((p) => (
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

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-[11px] uppercase text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  )
}

function fmtNum(n) {
  return n == null ? '—' : Number(n).toLocaleString()
}
function fmtPct(n) {
  return n == null ? '—' : `${Number(n).toFixed(1)}%`
}
function fmtMoney(n) {
  return n == null ? '—' : formatCurrency(n)
}
function fmtAwt(seconds) {
  if (seconds == null) return '—'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const perfDataColumns = [
  { key: 'views', label: 'Views', fmt: fmtNum },
  { key: 'uv', label: 'UV', fmt: fmtNum },
  { key: 'active', label: 'Active', fmt: fmtNum },
  { key: 'awt_seconds', label: 'AWT', fmt: fmtAwt },
  { key: 'pcu', label: 'PCU', fmt: fmtNum },
  { key: 'acu', label: 'ACU', fmt: (n) => (n == null ? '—' : Number(n).toFixed(1)) },
  { key: 'follows', label: 'Follows', fmt: fmtNum },
  { key: 'chats', label: 'Chats', fmt: fmtNum },
  { key: 'shares', label: 'Shares', fmt: fmtNum },
  { key: 'likes', label: 'Likes', fmt: fmtNum },
  { key: 'ord', label: 'ORD', fmt: fmtNum },
  { key: 'qty', label: 'QTY', fmt: fmtNum },
  { key: 'gmv', label: 'GMV', fmt: fmtMoney },
  { key: 'ret', label: 'RET', fmt: fmtNum },
  { key: 'ret_amount', label: 'RET$', fmt: fmtMoney },
  { key: 'ngr', label: 'NGR', fmt: fmtMoney },
  { key: 'aov', label: 'AOV', fmt: fmtMoney },
  { key: 'ret_pct', label: 'RET%', fmt: fmtPct },
  { key: 'gpm', label: 'GPM', fmt: (n) => (n == null ? '—' : Number(n).toFixed(1)) },
]

export default function PerformanceDashboard() {
  const { t } = useTranslation()
  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [range, setRange] = useState(daysAgoRange(6))
  const [summary, setSummary] = useState(null)
  const [ranking, setRanking] = useState([])
  const [perfData, setPerfData] = useState([])
  const [sort, setSort] = useState({ key: 'gmv', dir: 'desc' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { listLocations().then(setLocations) }, [])

  useEffect(() => {
    setLoading(true)
    const filters = { locationId: locationId || undefined, from: range.from, to: range.to }
    Promise.all([
      getPerformanceSummary(filters),
      getHostRanking(filters),
      getPerformanceData({ ...filters, sort: sort.key, dir: sort.dir }),
    ]).then(([s, r, p]) => {
      setSummary(s)
      setRanking(r)
      setPerfData(p)
      setLoading(false)
    })
  }, [locationId, range, sort])

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  }

  const showLocationColumn = !locationId

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_performance_dashboard.all_locations')}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {loading || !summary ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="QTY" value={fmtNum(summary.qty)} />
            <StatCard label="ORD" value={fmtNum(summary.ord)} />
            <StatCard label="GMV" value={fmtMoney(summary.gmv)} />
            <StatCard label="AVG QTY" value={fmtNum(summary.avg_qty)} />
            <StatCard label="AVG ORD" value={fmtNum(summary.avg_ord)} />
            <StatCard label="AOV" value={fmtMoney(summary.aov)} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_performance_dashboard.host_ranking_title')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">#</th>
                  <th className="p-2">{t('page_performance_dashboard.col_host')}</th>
                  {showLocationColumn && <th className="p-2">{t('page_performance_dashboard.col_location')}</th>}
                  <th className="p-2">GMV</th><th className="p-2">ORD</th><th className="p-2">QTY</th><th className="p-2">AOV</th><th className="p-2">GMV%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ranking.map((row, i) => (
                  <tr key={row.host_id}>
                    <td className="p-2 text-gray-400">{i + 1}</td>
                    <td className="p-2 font-medium text-gray-700">{row.host}</td>
                    {showLocationColumn && <td className="p-2 text-gray-500">{row.location_name}</td>}
                    <td className="p-2 font-semibold text-gray-700">{fmtMoney(row.gmv)}</td>
                    <td className="p-2 text-gray-500">{fmtNum(row.ord)}</td>
                    <td className="p-2 text-gray-500">{fmtNum(row.qty)}</td>
                    <td className="p-2 text-gray-500">{fmtMoney(row.aov)}</td>
                    <td className="p-2 text-gray-500">{fmtPct(row.gmv_pct)}</td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr><td colSpan={showLocationColumn ? 8 : 7} className="p-6 text-center text-gray-400">{t('page_performance_dashboard.no_hosts_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_performance_dashboard.performance_data_title')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_performance_dashboard.col_host')}</th>
                  {showLocationColumn && <th className="p-2">{t('page_performance_dashboard.col_location')}</th>}
                  {perfDataColumns.map((c) => (
                    <th key={c.key} className="p-2 cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                      {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {perfData.map((row) => (
                  <tr key={row.host_id}>
                    <td className="p-2 font-medium text-gray-700 whitespace-nowrap">{row.host}</td>
                    {showLocationColumn && <td className="p-2 text-gray-500 whitespace-nowrap">{row.location_name}</td>}
                    {perfDataColumns.map((c) => (
                      <td key={c.key} className="p-2 text-gray-600 whitespace-nowrap">{c.fmt(row[c.key])}</td>
                    ))}
                  </tr>
                ))}
                {perfData.length === 0 && (
                  <tr><td colSpan={perfDataColumns.length + (showLocationColumn ? 2 : 1)} className="p-6 text-center text-gray-400">{t('page_performance_dashboard.no_hosts_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
