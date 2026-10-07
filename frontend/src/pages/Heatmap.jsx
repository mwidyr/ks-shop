import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHeatmapSummary, getHeatmapGrid, getHeatmapCellDetail } from '../api/heatmap'
import { listLocations } from '../api/hostLocations'
import { formatCurrency } from '../utils/format'
import { IconClose } from '../components/icons'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses, Metric } from '../components/Table'

// The left block (Shift | Host | QTY) is its own fixed, non-scrolling table next to the
// horizontally-scrolling time-slot table - no position:sticky, so nothing can ever show through or
// paint over it. Because they are two tables, every row must have the same fixed height.
const HOST_COL_WIDTH = 120
const QTY_COL_WIDTH = 56
const SHIFT_COL_WIDTH = 80
const CELL_GAP = 2
const HEAD_ROW_H = 36
const BODY_ROW_H = 28
// Fixed-English display labels (deliberately separate from the page_hosts.shift_* i18n keys
// used elsewhere in the app, which stay correctly translated per locale) - the client explicitly
// wants "Morning/Middle/Night" in all 3 languages here, including "Night" for what's stored as
// 'evening' everywhere else in the schema/UI.
const SHIFT_LABELS = { morning: 'Morning', middle: 'Middle', evening: 'Night' }
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

function PeriodPicker({ value, onChange, active, onActiveChange }) {
  const { t } = useTranslation()
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)
  function selectPreset(p) {
    onActiveChange(p.key)
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

const NUM_SLOTS = 48
function slotLabel(i) {
  const hour = Math.floor(i / 2)
  const minute = (i % 2) * 30
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const TIME_BLOCK_LABELS = [
  '00:00-02:30', '03:00-05:30', '06:00-08:30', '09:00-11:30',
  '12:00-14:30', '15:00-17:30', '18:00-20:30', '21:00-23:30',
]

// Real-time NOW indicator (item 058): Jakarta time -> matching 30-minute slot index, same
// floor(minute/30) rule as the backend's slotIndexExpr (heatmap.go).
function jakartaNowSlot() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 2 + Math.floor(minute / 30)
}

// Fixed QTY thresholds per level, keyed by how many days are in the selected range - client spec
// (item 029-033): the busier the period, the higher the bar for each color level has to be.
// Three separate 5-step palettes so the main grid, ALL row, and AVERAGE row read as visually
// distinct at a glance: green (main grid), pink -> dark red (ALL), light yellow -> dark orange
// (AVERAGE) - same 5 threshold levels underneath, just a different ramp per row.
const MAIN_COLORS = ['#E8F3E9', '#C5E3C8', '#81C784', '#43A047', '#196B24']
const ALL_COLORS = ['#FCE4E9', '#F5B8C4', '#E8748C', '#C62E45', '#7A0F1F']
const AVG_COLORS = ['#FFF6DA', '#FFE29A', '#FFC14D', '#F57C1F', '#B84A00']
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

function cellColor(qty, rangeDays, colors = MAIN_COLORS) {
  if (!qty) return { className: 'bg-gray-50 text-gray-300' }
  const levels = getThresholdTable(rangeDays)
  const level = levels.filter((max) => qty > max).length
  return { style: { background: colors[level], color: level >= 3 ? '#fff' : '#1f2937' } }
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
      <div className={`${cardClasses} p-6 w-full max-w-md`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">{cell.hostName}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{slotLabel(cell.slot)} · {cell.from}{multiDay ? ` – ${cell.to}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><IconClose /></button>
        </div>
        {!detail ? (
          <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{t('common.loading')}</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">QTY</p><Metric type="qty">{fmtNum(detail.qty)}</Metric></div>
              <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">ORD</p><Metric type="ord">{fmtNum(detail.ord)}</Metric></div>
              <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">GMV</p><Metric type="gmv">{fmtMoney(detail.gmv)}</Metric></div>
              <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">AOV</p><p className="font-bold text-[var(--text-primary)]">{fmtMoney(detail.aov)}</p></div>
            </div>
            {detail.orders?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{t('page_heatmap.order_breakdown')}</p>
                <table className={`${tableClasses} text-xs`}>
                  <thead>
                    <tr className={theadRowClasses}>
                      <th className="py-1">{t('page_purchases.th_po_number')}</th>
                      {multiDay && <th className="py-1">{t('page_host_analytics.col_date')}</th>}
                      <th className="py-1">QTY</th><th className="py-1">GMV</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyClasses}>
                    {detail.orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className={`cursor-pointer ${rowClasses}`}
                        title={t('page_heatmap.view_order_detail')}
                      >
                        <td className="py-1 font-medium text-brand-700 underline decoration-dotted font-mono">{o.order_no}</td>
                        {multiDay && <td className="py-1 text-[var(--text-secondary)]">{new Date(o.created_at).toLocaleDateString()}</td>}
                        <td className="py-1"><Metric type="qty">{fmtNum(o.qty)}</Metric></td>
                        <td className="py-1"><Metric type="gmv">{fmtMoney(o.gmv)}</Metric></td>
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
  const [activePreset, setActivePreset] = useState('today')
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => { listLocations().then(setLocations) }, [])

  // Keeps the NOW indicator (item 058) actually moving as time passes while the page stays open,
  // without re-fetching data - just forces a re-render to recompute jakartaNowSlot().
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // nowTick (unused directly) exists purely to force this re-render every 60s, so nowSlot below
  // stays current as time passes while the page is open.
  void nowTick
  const nowSlot = activePreset === 'today' ? jakartaNowSlot() : null

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
      <div className={`${cardClasses} p-4 space-y-3`}>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_performance_dashboard.all_locations')}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <PeriodPicker value={range} onChange={setRange} active={activePreset} onActiveChange={setActivePreset} />
        <p className="text-sm font-semibold text-[var(--text-primary)]">{range.from === range.to ? range.from : `${range.from} – ${range.to}`}</p>
      </div>

      {loading || !grid ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className={`${cardClasses} p-4`}><p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_heatmap.total_qty')}</p><Metric type="qty" className="text-lg">{fmtNum(summary.qty)}</Metric></div>
            <div className={`${cardClasses} p-4`}><p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_heatmap.total_ord')}</p><Metric type="ord" className="text-lg">{fmtNum(summary.ord)}</Metric></div>
            <div className={`${cardClasses} p-4`}><p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_heatmap.total_gmv')}</p><Metric type="gmv" className="text-lg">{fmtMoney(summary.gmv)}</Metric></div>
          </div>

          <div className={`${cardClasses} p-5 flex`}>
            {/* Left block: fixed, opaque, never scrolls. */}
            <table className="text-xs border-separate flex-none bg-[var(--table-card-bg)] border-r border-gray-200 pr-1 mr-1" style={{ borderSpacing: CELL_GAP }}>
              <thead>
                <tr style={{ height: HEAD_ROW_H }}>
                  <th className="p-1 text-left whitespace-nowrap" style={{ width: SHIFT_COL_WIDTH, minWidth: SHIFT_COL_WIDTH }}>{t('page_heatmap.col_shift')}</th>
                  <th className="p-1 text-left whitespace-nowrap" style={{ width: HOST_COL_WIDTH, minWidth: HOST_COL_WIDTH }}>{t('page_heatmap.col_host')}</th>
                  {/* Always literal "QTY" in all 3 languages per the client spec - no t() call. */}
                  <th className="p-1 text-right whitespace-nowrap" style={{ width: QTY_COL_WIDTH, minWidth: QTY_COL_WIDTH }}>QTY</th>
                </tr>
              </thead>
              <tbody>
                {grid.hosts.map((host) => (
                  <tr key={host.host_id} style={{ height: BODY_ROW_H }}>
                    <td className="p-1 font-medium text-gray-500 whitespace-nowrap">{SHIFT_LABELS[host.shift] || ''}</td>
                    <td className="p-1 font-medium text-gray-700" title={host.host_name}>
                      <div className="truncate" style={{ maxWidth: HOST_COL_WIDTH }}>{host.host_name}</div>
                    </td>
                    <td className="p-1 text-right font-semibold text-gray-700 whitespace-nowrap">{fmtNum(host.total_qty)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200" style={{ height: BODY_ROW_H }}>
                  <td className="p-1"></td>
                  <td className="p-1 font-bold text-gray-800">ALL</td>
                  <td className="p-1 text-right font-bold text-gray-800 whitespace-nowrap">{fmtNum(grid.all_row.reduce((a, b) => a + b, 0))}</td>
                </tr>
                <tr style={{ height: BODY_ROW_H }}>
                  <td className="p-1"></td>
                  <td className="p-1 font-bold text-gray-500"><div className="truncate" style={{ maxWidth: HOST_COL_WIDTH }}>{t('page_heatmap.average_row')}</div></td>
                  <td className="p-1"></td>
                </tr>
              </tbody>
            </table>

            {/* Right pane: only the time-slot columns scroll. */}
            <div className="overflow-x-auto flex-1 min-w-0">
              <table className="text-xs border-separate" style={{ borderSpacing: CELL_GAP }}>
                <thead>
                  <tr style={{ height: HEAD_ROW_H }}>
                    {Array.from({ length: NUM_SLOTS }).map((_, i) => (
                      <th key={i} className="p-1 font-normal text-gray-400 whitespace-nowrap relative">
                        {i === nowSlot && (
                          <div className="flex flex-col items-center leading-none mb-0.5">
                            <span className="text-[8px] font-bold text-red-600 bg-red-50 px-1 rounded-full">{t('page_heatmap.now_badge')}</span>
                            <span className="text-red-600 text-[7px] -mt-px">▼</span>
                          </div>
                        )}
                        <span className={i === nowSlot ? 'font-bold text-black' : ''}>{slotLabel(i)}</span>
                        {i === nowSlot && <div className="absolute right-0 top-0 bottom-0 w-px bg-red-500 pointer-events-none" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.hosts.map((host) => (
                    <tr key={host.host_id} style={{ height: BODY_ROW_H }}>
                      {host.slots.map((qty, i) => {
                        const color = cellColor(qty, rangeDays)
                        return (
                          <td
                            key={i}
                            onClick={() => qty > 0 && setActiveCell({ hostId: host.host_id, hostName: host.host_name, slot: i, from: range.from, to: range.to, locationId: locationId || undefined })}
                            className={`p-1 text-center rounded cursor-pointer relative ${color.className || ''}`}
                            style={color.style}
                          >
                            {qty || ''}
                            {i === nowSlot && <div className="absolute right-0 top-0 bottom-0 w-px bg-red-500 pointer-events-none" />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200" style={{ height: BODY_ROW_H }}>
                    {grid.all_row.map((qty, i) => {
                      const color = cellColor(qty, rangeDays, ALL_COLORS)
                      return (
                        <td key={i} className={`p-1 text-center font-semibold rounded relative ${color.className || ''}`} style={color.style}>
                          {qty || ''}
                          {i === nowSlot && <div className="absolute right-0 top-0 bottom-0 w-px bg-red-500 pointer-events-none" />}
                        </td>
                      )
                    })}
                  </tr>
                  <tr style={{ height: BODY_ROW_H }}>
                    {grid.avg_row.map((v, i) => {
                      const color = cellColor(v == null ? 0 : Math.round(v), rangeDays, AVG_COLORS)
                      return (
                        <td key={i} className={`p-1 text-center rounded relative ${color.className || ''}`} style={color.style}>
                          {v == null ? '—' : v.toFixed(1)}
                          {i === nowSlot && <div className="absolute right-0 top-0 bottom-0 w-px bg-red-500 pointer-events-none" />}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${cardClasses} p-5`}>
            <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_heatmap.time_block_total')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              {TIME_BLOCK_LABELS.map((label, i) => (
                <div key={label}>
                  <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{label}</p>
                  <Metric type="qty" className="text-lg">{fmtNum(grid.time_blocks[i])}</Metric>
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
