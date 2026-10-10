import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPerformanceSummary, getHostRanking, getPerformanceData } from '../api/performanceDashboard'
import { listLocations } from '../api/hostLocations'
import { listHosts } from '../api/hosts'
import { listAffiliates } from '../api/affiliates'
import { formatCurrency } from '../utils/format'
import SalesChannelFilter from '../components/SalesChannelFilter'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses, Metric } from '../components/Table'
import PeriodPicker, { daysAgoRange } from '../components/PeriodPicker'

const statMetricType = { QTY: 'qty', ORD: 'ord', GMV: 'gmv' }

function StatCard({ label, value, sub, className = '' }) {
  const type = statMetricType[label.replace('AVG ', '')]
  return (
    <div className={`${cardClasses} p-4 ${className}`}>
      <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{label}</p>
      {type ? <Metric type={type} className="text-lg">{value}</Metric> : <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>}
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-1">{sub}</p>}
    </div>
  )
}

function fmtNum(n) {
  return n == null ? '—' : Number(n).toLocaleString()
}
function fmtDec(n) {
  return n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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
  const [hosts, setHosts] = useState([])
  const [hostId, setHostId] = useState('')
  const [channel, setChannel] = useState('all')
  const [affiliateId, setAffiliateId] = useState('')
  const [affiliates, setAffiliates] = useState([])
  const [range, setRange] = useState(daysAgoRange(6))
  const [summary, setSummary] = useState(null)
  const [ranking, setRanking] = useState([])
  const [perfData, setPerfData] = useState([])
  const [sort, setSort] = useState({ key: 'gmv', dir: 'desc' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { listLocations().then(setLocations) }, [])
  useEffect(() => { listAffiliates().then(setAffiliates) }, [])
  useEffect(() => { listHosts(false, locationId || undefined).then(setHosts) }, [locationId])

  useEffect(() => {
    setLoading(true)
    const filters = {
      locationId: channel === 'live' ? (locationId || undefined) : undefined,
      hostId: channel === 'live' ? (hostId || undefined) : undefined,
      from: range.from, to: range.to, channel,
      affiliateId: channel === 'website' ? (affiliateId || undefined) : undefined,
    }
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
  }, [locationId, hostId, range, sort, channel, affiliateId])

  const selectedLocationName = locationId ? locations.find((l) => String(l.id) === String(locationId))?.name : null
  const selectedHostName = hostId ? hosts.find((h) => String(h.id) === String(hostId))?.name : null
  const titleParts = [selectedLocationName, selectedHostName].filter(Boolean)
  const dashboardTitle = channel === 'live'
    ? (titleParts.length ? titleParts.join(' — ') : t('page_performance_dashboard.all_locations_agents'))
    : null

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  }

  const showLocationColumn = !locationId

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className={`${cardClasses} p-4 space-y-3`}>
        <SalesChannelFilter
          channel={channel} onChannelChange={setChannel}
          locationId={locationId} onLocationChange={setLocationId} locations={locations}
          hostId={hostId} onHostChange={setHostId} hosts={hosts}
          affiliateId={affiliateId} onAffiliateChange={setAffiliateId} affiliates={affiliates}
        />
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {dashboardTitle && (
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{dashboardTitle}</h1>
      )}

      {loading || !summary ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Desktop 3 + 3; mobile 2-1-2-1 (QTY|ORD, GMV, AVG QTY|AVG ORD, AVG GMV). AOV sits under ORD. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="QTY" value={fmtNum(summary.qty)} />
            <StatCard label="ORD" value={fmtNum(summary.ord)} sub={`AOV ${fmtMoney(summary.aov)}`} />
            <StatCard label="GMV" value={fmtMoney(summary.gmv)} className="col-span-2 sm:col-span-1" />
            <StatCard label="AVG QTY" value={fmtDec(summary.avg_qty)} />
            <StatCard label="AVG ORD" value={fmtDec(summary.avg_ord)} />
            <StatCard label="AVG GMV" value={fmtMoney(summary.avg_gmv)} className="col-span-2 sm:col-span-1" />
          </div>

          <div className={`${cardClasses} p-5 overflow-x-auto`}>
            <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_performance_dashboard.host_ranking_title')}</h2>
            <table className={tableClasses}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="p-2">#</th>
                  <th className="p-2">{t('page_performance_dashboard.col_host')}</th>
                  {showLocationColumn && <th className="p-2">{t('page_performance_dashboard.col_location')}</th>}
                  <th className="p-2">QTY</th><th className="p-2">ORD</th><th className="p-2">GMV</th><th className="p-2">AOV</th><th className="p-2">GMV%</th>
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {ranking.map((row, i) => (
                  <tr key={row.host_id} className={rowClasses}>
                    <td className="p-2 text-[var(--text-secondary)]">{i + 1}</td>
                    <td className="p-2 font-medium text-[var(--text-primary)]">{row.host}</td>
                    {showLocationColumn && <td className="p-2 text-[var(--text-secondary)]">{row.location_name}</td>}
                    <td className="p-2"><Metric type="qty">{fmtNum(row.qty)}</Metric></td>
                    <td className="p-2"><Metric type="ord">{fmtNum(row.ord)}</Metric></td>
                    <td className="p-2"><Metric type="gmv">{fmtMoney(row.gmv)}</Metric></td>
                    <td className="p-2 text-[var(--text-secondary)]">{fmtMoney(row.aov)}</td>
                    <td className="p-2 text-[var(--text-secondary)]">{fmtPct(row.gmv_pct)}</td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr><td colSpan={showLocationColumn ? 8 : 7} className="p-6 text-center text-[var(--text-secondary)]">{t('page_performance_dashboard.no_hosts_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={`${cardClasses} p-5 overflow-x-auto`}>
            <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_performance_dashboard.performance_data_title')}</h2>
            <table className={tableClasses}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="p-2">{t('page_performance_dashboard.col_host')}</th>
                  {showLocationColumn && <th className="p-2">{t('page_performance_dashboard.col_location')}</th>}
                  {perfDataColumns.map((c) => (
                    <th key={c.key} className="p-2 cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                      {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {perfData.map((row) => (
                  <tr key={row.host_id} className={rowClasses}>
                    <td className="p-2 font-medium text-[var(--text-primary)] whitespace-nowrap">{row.host}</td>
                    {showLocationColumn && <td className="p-2 text-[var(--text-secondary)] whitespace-nowrap">{row.location_name}</td>}
                    {perfDataColumns.map((c) => {
                      const metricType = c.key === 'qty' ? 'qty' : c.key === 'ord' ? 'ord' : c.key === 'gmv' ? 'gmv' : null
                      return (
                        <td key={c.key} className="p-2 text-[var(--text-secondary)] whitespace-nowrap">
                          {metricType ? <Metric type={metricType}>{c.fmt(row[c.key])}</Metric> : c.fmt(row[c.key])}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {perfData.length === 0 && (
                  <tr><td colSpan={perfDataColumns.length + (showLocationColumn ? 2 : 1)} className="p-6 text-center text-[var(--text-secondary)]">{t('page_performance_dashboard.no_hosts_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
