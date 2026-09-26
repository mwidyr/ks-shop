import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHeatmapSummary, getHeatmapGrid, getHeatmapCellDetail } from '../api/heatmap'
import { listLocations } from '../api/hostLocations'
import { formatCurrency } from '../utils/format'
import { IconClose } from '../components/icons'

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
  const [active, setActive] = useState('today')
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

const NUM_SLOTS = 35
function slotLabel(i) {
  const hour = 6 + Math.floor(i / 2)
  const minute = (i % 2) * 30
  return `${hour}:${String(minute).padStart(2, '0')}`
}

// Fixed QTY thresholds per level, keyed by how many days are in the selected range - client spec
// (item 029-033): the busier the period, the higher the bar for each color level has to be.
const LEVEL_COLORS = ['#E8F3E9', '#C5E3C8', '#81C784', '#43A047', '#196B24']
const THRESHOLD_TABLES = [
  { maxDays: 1, levels: [2, 5, 8, 12] },
  { maxDays: 7, levels: [3, 8, 15, 25] },
  { maxDays: 14, levels: [4, 10, 20, 35] },
  { maxDays: 31, levels: [5, 15, 30, 50] },
]

function getThresholdTable(rangeDays) {
  const table = THRESHOLD_TABLES.find((t) => rangeDays <= t.maxDays)
  return table ? table.levels : THRESHOLD_TABLES[THRESHOLD_TABLES.length - 1].levels
}

function cellColor(qty, rangeDays) {
  if (!qty) return { className: 'bg-gray-50 text-gray-300' }
  const levels = getThresholdTable(rangeDays)
  const level = levels.filter((max) => qty > max).length
  return { style: { background: LEVEL_COLORS[level], color: level >= 3 ? '#fff' : '#1f2937' } }
}

function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString() }
function fmtMoney(n) { return n == null ? '—' : formatCurrency(n) }

function CellDetailModal({ cell, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    getHeatmapCellDetail({ hostId: cell.hostId, slot: cell.slot, from: cell.from, to: cell.to, locationId: cell.locationId }).then(setDetail)
  }, [cell])

  const multiDay = cell.from !== cell.to

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800">{cell.hostName}</h2>
            <p className="text-xs text-gray-500">{slotLabel(cell.slot)} · {cell.from}{multiDay ? ` – ${cell.to}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        {!detail ? (
          <p className="text-sm text-gray-400 py-6 text-center">{t('common.loading')}</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div><p className="text-[11px] uppercase text-gray-400">QTY</p><p className="font-bold text-gray-800">{fmtNum(detail.qty)}</p></div>
              <div><p className="text-[11px] uppercase text-gray-400">ORD</p><p className="font-bold text-gray-800">{fmtNum(detail.ord)}</p></div>
              <div><p className="text-[11px] uppercase text-gray-400">GMV</p><p className="font-bold text-gray-800">{fmtMoney(detail.gmv)}</p></div>
              <div><p className="text-[11px] uppercase text-gray-400">AOV</p><p className="font-bold text-gray-800">{fmtMoney(detail.aov)}</p></div>
            </div>
            {detail.orders?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">{t('page_heatmap.order_breakdown')}</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase border-b">
                      <th className="py-1">{t('page_purchases.th_po_number')}</th>
                      {multiDay && <th className="py-1">{t('page_host_analytics.col_date')}</th>}
                      <th className="py-1">QTY</th><th className="py-1">GMV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="cursor-pointer hover:bg-gray-50"
                        title={t('page_heatmap.view_order_detail')}
                      >
                        <td className="py-1 font-medium text-brand-700 underline decoration-dotted font-mono">{o.order_no}</td>
                        {multiDay && <td className="py-1 text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>}
                        <td className="py-1 text-gray-500">{fmtNum(o.qty)}</td>
                        <td className="py-1 text-gray-500">{fmtMoney(o.gmv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Heatmap() {
  const { t } = useTranslation()
  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [range, setRange] = useState(daysAgoRange(0))
  const [summary, setSummary] = useState(null)
  const [grid, setGrid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCell, setActiveCell] = useState(null)

  useEffect(() => { listLocations().then(setLocations) }, [])

  useEffect(() => {
    setLoading(true)
    const filters = { locationId: locationId || undefined, from: range.from, to: range.to }
    Promise.all([getHeatmapSummary(filters), getHeatmapGrid(filters)]).then(([s, g]) => {
      setSummary(s); setGrid(g); setLoading(false)
    })
  }, [locationId, range])

  const rangeDays = useMemo(() => {
    return Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1
  }, [range])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_performance_dashboard.all_locations')}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <PeriodPicker value={range} onChange={setRange} />
        <p className="text-sm font-semibold text-gray-700">{range.from === range.to ? range.from : `${range.from} – ${range.to}`}</p>
      </div>

      {loading || !grid ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_heatmap.total_qty')}</p><p className="text-lg font-bold text-gray-800">{fmtNum(summary.qty)}</p></div>
            <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_heatmap.total_ord')}</p><p className="text-lg font-bold text-gray-800">{fmtNum(summary.ord)}</p></div>
            <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_heatmap.total_gmv')}</p><p className="text-lg font-bold text-gray-800">{fmtMoney(summary.gmv)}</p></div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="p-1 text-left sticky left-0 bg-white">{t('page_heatmap.col_host')}</th>
                  <th className="p-1 text-right">{t('page_heatmap.total_qty')}</th>
                  {Array.from({ length: NUM_SLOTS }).map((_, i) => (
                    <th key={i} className="p-1 font-normal text-gray-400 whitespace-nowrap">{slotLabel(i)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.hosts.map((host) => (
                  <tr key={host.host_id}>
                    <td className="p-1 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">
                      {host.host_name}{host.shift && <span className="text-gray-400"> ({t(`page_hosts.shift_${host.shift}`)})</span>}
                    </td>
                    <td className="p-1 text-right font-semibold text-gray-700">{fmtNum(host.total_qty)}</td>
                    {host.slots.map((qty, i) => {
                      const color = cellColor(qty, rangeDays)
                      return (
                        <td
                          key={i}
                          onClick={() => qty > 0 && setActiveCell({ hostId: host.host_id, hostName: host.host_name, slot: i, from: range.from, to: range.to, locationId: locationId || undefined })}
                          className={`p-1 text-center rounded cursor-pointer ${color.className || ''}`}
                          style={color.style}
                        >
                          {qty || ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200">
                  <td className="p-1 font-bold text-gray-800 sticky left-0 bg-white">ALL</td>
                  <td className="p-1 text-right font-bold text-gray-800">{fmtNum(grid.all_row.reduce((a, b) => a + b, 0))}</td>
                  {grid.all_row.map((qty, i) => {
                    const color = cellColor(qty, rangeDays)
                    return <td key={i} className={`p-1 text-center font-semibold rounded ${color.className || ''}`} style={color.style}>{qty || ''}</td>
                  })}
                </tr>
                <tr>
                  <td className="p-1 font-bold text-gray-500 sticky left-0 bg-white">{t('page_heatmap.average_row')}</td>
                  <td className="p-1"></td>
                  {grid.avg_row.map((v, i) => {
                    const color = cellColor(v == null ? 0 : Math.round(v), rangeDays)
                    return <td key={i} className={`p-1 text-center rounded ${color.className || ''}`} style={color.style}>{v == null ? '—' : v.toFixed(1)}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_heatmap.time_block_total')}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {['06:00-08:30', '09:00-11:30', '12:00-14:30', '15:00-17:30', '18:00-20:30', '21:00-23:30'].map((label, i) => (
                <div key={label}>
                  <p className="text-[11px] uppercase text-gray-400 mb-1">{label}</p>
                  <p className="text-lg font-bold text-gray-800">{fmtNum(grid.time_blocks[i])}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeCell && <CellDetailModal cell={activeCell} onClose={() => setActiveCell(null)} />}
    </div>
  )
}
