import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLifetime, getHostAnalyticsSummary, getHistoricalBest, getHostAnalyticsPerformanceData } from '../api/hostAnalytics'
import { listLocations } from '../api/hostLocations'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'

function isoDate(d) { return d.toISOString().slice(0, 10) }
function startOfWeek(d) {
  const day = d.getDay()
  const start = new Date(d)
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  return start
}
function daysAgoRange(days) {
  const to = new Date(); const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: isoDate(from), to: isoDate(to) }
}
function singleDayRange(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo)
  return { from: isoDate(d), to: isoDate(d) }
}
function thisWeekRange() { const now = new Date(); return { from: isoDate(startOfWeek(now)), to: isoDate(now) } }
function lastWeekRange() {
  const thisStart = startOfWeek(new Date())
  const lastEnd = new Date(thisStart); lastEnd.setDate(lastEnd.getDate() - 1)
  const lastStart = new Date(lastEnd); lastStart.setDate(lastStart.getDate() - 6)
  return { from: isoDate(lastStart), to: isoDate(lastEnd) }
}
function thisMonthRange() { const now = new Date(); return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) } }
function lastMonthRange() {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: isoDate(new Date(end.getFullYear(), end.getMonth(), 1)), to: isoDate(end) }
}
const ALL_TIME = { from: '1970-01-01', to: isoDate(new Date()) }

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
  { key: 'all_time', labelKey: 'page_host_analytics.period_all_time', range: () => ALL_TIME },
  { key: 'custom', labelKey: 'shared.date_custom' },
]

function PeriodPicker({ value, onChange }) {
  const { t } = useTranslation()
  const [active, setActive] = useState('7d')
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)
  function selectPreset(p) {
    setActive(p.key)
    if (p.key === 'custom') return
    const range = p.range()
    setCustomFrom(range.from); setCustomTo(range.to)
    onChange(range)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {periodPresets.map((p) => (
        <button key={p.key} onClick={() => selectPreset(p)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${active === p.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
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

function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString() }
function fmtPct(n) { return n == null ? '—' : `${Number(n).toFixed(1)}%` }
function fmtMoney(n) { return n == null ? '—' : formatCurrency(n) }
function fmtAwt(seconds) {
  if (seconds == null) return '—'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function fmtDec(n) { return n == null ? '—' : Number(n).toFixed(1) }

const metricColumns = [
  { key: 'views', label: 'Views', fmt: fmtNum },
  { key: 'uv', label: 'UV', fmt: fmtNum },
  { key: 'active', label: 'Active', fmt: fmtNum },
  { key: 'awt_seconds', label: 'AWT', fmt: fmtAwt },
  { key: 'pcu', label: 'PCU', fmt: fmtNum },
  { key: 'acu', label: 'ACU', fmt: fmtDec },
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
  { key: 'gpm', label: 'GPM', fmt: fmtDec },
]

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-[11px] uppercase text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  )
}

function BestCard({ label, metric, t }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-[11px] uppercase text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{metric?.value == null ? '—' : fmtNum(metric.value)}</p>
      {metric?.value != null && (
        <p className="text-xs text-gray-500 mt-0.5">
          {metric.date}{metric.shift ? ` · ${t(`page_hosts.shift_${metric.shift}`)}` : ''}
        </p>
      )}
    </div>
  )
}

export default function HostPerformanceAnalytics() {
  const { t } = useTranslation()
  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [locationId, setLocationId] = useState('')
  const [hostId, setHostId] = useState('')
  const [range, setRange] = useState(daysAgoRange(6))
  const [page, setPage] = useState(1)

  const [lifetime, setLifetime] = useState(null)
  const [summary, setSummary] = useState(null)
  const [best, setBest] = useState(null)
  const [daily, setDaily] = useState({ rows: [], page: 1, page_size: 50 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { listLocations().then(setLocations) }, [])
  useEffect(() => {
    listHosts(false, locationId || undefined).then(setHosts)
    setHostId('')
  }, [locationId])

  useEffect(() => { setPage(1) }, [locationId, hostId, range])

  useEffect(() => {
    setLoading(true)
    const baseFilters = { locationId: locationId || undefined, hostId: hostId || undefined }
    Promise.all([
      getLifetime(baseFilters),
      getHostAnalyticsSummary({ ...baseFilters, from: range.from, to: range.to }),
      getHistoricalBest(baseFilters),
      getHostAnalyticsPerformanceData({ ...baseFilters, from: range.from, to: range.to, page }),
    ]).then(([lt, sm, hb, pd]) => {
      setLifetime(lt); setSummary(sm); setBest(hb); setDaily(pd)
      setLoading(false)
    })
  }, [locationId, hostId, range, page])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_performance_dashboard.all_locations')}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_host_analytics.all_hosts')}</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {loading || !lifetime ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_host_analytics.lifetime_title')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2"></th>
                  {metricColumns.map((c) => <th key={c.key} className="p-2 whitespace-nowrap">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-2 font-semibold text-gray-700">{t('page_host_analytics.lifetime_total')}</td>
                  {metricColumns.map((c) => <td key={c.key} className="p-2 text-gray-600 whitespace-nowrap">{c.fmt(lifetime.total[c.key])}</td>)}
                </tr>
                <tr>
                  <td className="p-2 font-semibold text-gray-700">{t('page_host_analytics.lifetime_avg_live')}</td>
                  {metricColumns.map((c) => <td key={c.key} className="p-2 text-gray-600 whitespace-nowrap">{c.fmt(lifetime.avg_live[c.key])}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="font-bold text-gray-800 mb-2">{t('page_host_analytics.key_performance_title')}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-4">
              <StatCard label="QTY" value={fmtNum(summary.qty)} />
              <StatCard label="ORD" value={fmtNum(summary.ord)} />
              <StatCard label="GMV" value={fmtMoney(summary.gmv)} />
              <StatCard label="AVG QTY" value={fmtNum(summary.avg_qty)} />
              <StatCard label="AVG ORD" value={fmtNum(summary.avg_ord)} />
              <StatCard label="AVG GMV" value={fmtMoney(summary.avg_gmv)} />
            </div>
            <h2 className="font-bold text-gray-800 mb-2">{t('page_host_analytics.efficiency_title')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
              <StatCard label="AVG Chats" value={fmtNum(summary.avg_chats)} />
              <StatCard label="ORD CVR" value={fmtPct(summary.ord_cvr)} />
              <StatCard label={t('page_host_analytics.items_per_order')} value={fmtDec(summary.items_per_order)} />
              <StatCard label="AOV" value={fmtMoney(summary.aov)} />
              <StatCard label={t('page_host_analytics.gmv_per_uv')} value={fmtMoney(summary.gmv_per_uv)} />
            </div>
            <h2 className="font-bold text-gray-800 mb-2">{t('page_host_analytics.historical_best_title')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              <BestCard t={t} label="Highest QTY" metric={best.highest_qty} />
              <BestCard t={t} label="Highest ORD" metric={best.highest_ord} />
              <BestCard t={t} label="Highest GMV" metric={best.highest_gmv} />
              <BestCard t={t} label="Highest Views" metric={best.highest_views} />
              <BestCard t={t} label="Highest PCU" metric={best.highest_pcu} />
              <BestCard t={t} label="Best AWT" metric={best.highest_awt} />
              <BestCard t={t} label="Best GPM" metric={best.highest_gpm} />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">{t('page_host_analytics.performance_data_title')}</h2>
              <div className="flex items-center gap-2 text-xs">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">{t('common.previous')}</button>
                <span className="text-gray-500">{page}</span>
                <button disabled={daily.rows.length < daily.page_size} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">{t('common.next')}</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_host_analytics.col_date')}</th>
                  {metricColumns.map((c) => <th key={c.key} className="p-2 whitespace-nowrap">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {daily.rows.map((row) => (
                  <tr key={row.date}>
                    <td className="p-2 font-medium text-gray-700 whitespace-nowrap">{row.date}</td>
                    {metricColumns.map((c) => <td key={c.key} className="p-2 text-gray-600 whitespace-nowrap">{c.fmt(row[c.key])}</td>)}
                  </tr>
                ))}
                {daily.rows.length === 0 && (
                  <tr><td colSpan={metricColumns.length + 1} className="p-6 text-center text-gray-400">{t('page_host_analytics.no_data_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
