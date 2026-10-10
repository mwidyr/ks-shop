import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/format'
import { cardClasses, Metric } from './Table'

const HEAD_H = 40
const ROW_H = 68

const int = (n) => Number(n).toLocaleString()
const dec = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const money = (n) => formatCurrency(Math.round(n))
const awt = (seconds) => {
  const s = Math.round(Math.abs(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const signed = (fmt) => (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`

// live = LIVE-only column (hidden while no group has LIVE data); type = QTY/ORD/GMV bold colour.
const COLUMNS = [
  { key: 'views', label: 'VIEWS', live: true, fmt: int },
  { key: 'awt_seconds', label: 'AWT', live: true, fmt: awt },
  { key: 'acu', label: 'ACU', live: true, fmt: dec },
  { key: 'chats', label: 'CHATS', live: true, fmt: int },
  { key: 'ord', label: 'ORD', type: 'ord', fmt: int },
  { key: 'qty', label: 'QTY', type: 'qty', fmt: int },
  { key: 'gmv', label: 'GMV', type: 'gmv', fmt: money },
  { key: 'aov', label: 'AOV', fmt: money },
  { key: 'gpm', label: 'GPM', live: true, fmt: dec },
  { key: 'avg_qty', label: 'AVG QTY', type: 'qty', fmt: dec },
  { key: 'avg_ord', label: 'AVG ORD', type: 'ord', fmt: dec },
  { key: 'avg_gmv', label: 'AVG GMV', type: 'gmv', fmt: money },
]

function Cell({ col, value, base, isBaseline }) {
  if (value == null) return <span className="text-[var(--text-secondary)]">—</span>
  const shown = <span className="font-semibold text-[var(--text-primary)]">{col.fmt(value)}</span>
  const main = col.type ? <Metric type={col.type} className="font-semibold">{col.fmt(value)}</Metric> : shown
  if (isBaseline || base == null) return main
  const diff = value - base
  const pct = base !== 0 ? (diff / Math.abs(base)) * 100 : null
  const up = diff > 0
  const flat = Math.abs(diff) < 1e-9
  const color = flat ? 'text-[var(--text-secondary)]' : up ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="flex flex-col items-end leading-tight">
      {main}
      <span className={`text-[11px] ${color}`}>
        {flat ? '' : up ? '↑ ' : '↓ '}{pct == null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`}
      </span>
      <span className={`text-[11px] ${color}`}>{flat ? '0' : signed(col.fmt)(diff)}</span>
    </div>
  )
}

// Results of the Custom Performance Comparison: one row per group, every metric a column. The
// Group column is its own fixed table beside a horizontally scrolling metrics table (no sticky
// positioning, same approach as the Heatmap) so it stays put on desktop and mobile.
export default function ComparisonResults({ rows }) {
  const { t } = useTranslation()
  const base = rows.find((r) => r.isBaseline)?.data || null
  const columns = useMemo(() => {
    const hasLive = rows.some((r) => r.data && COLUMNS.some((c) => c.live && r.data[c.key] != null))
    return COLUMNS.filter((c) => hasLive || !c.live)
  }, [rows])
  const th = 'px-3 text-right text-[11px] uppercase text-[var(--text-secondary)] font-medium whitespace-nowrap'

  return (
    <div className={`${cardClasses} p-4`}>
      <h2 className="font-bold text-[var(--text-primary)]">{t('page_performance_comparison.results_title')}</h2>
      <p className="text-xs text-[var(--text-secondary)] mb-3">{t('page_performance_comparison.results_subtitle')}</p>
      <div className="flex">
        <table className="text-sm shrink-0">
          <thead>
            <tr className="border-b border-[var(--table-divider)]" style={{ height: HEAD_H }}>
              <th className="pr-3 text-left text-[11px] uppercase text-[var(--text-secondary)] font-medium">{t('page_performance_comparison.col_group')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--table-divider)]">
            {rows.map((r) => (
              <tr key={r.id} style={{ height: ROW_H }}>
                <td className="pr-3 whitespace-nowrap">
                  <span className="text-xs font-bold text-white px-2.5 py-1 rounded-md" style={{ background: r.isBaseline ? r.color : '#6B7280' }}>{r.label}</span>
                  {r.isBaseline && <span className="block text-[10px] font-semibold text-emerald-600 mt-1">{t('page_performance_comparison.baseline')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="overflow-x-auto flex-1 min-w-0">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b border-[var(--table-divider)]" style={{ height: HEAD_H }}>
                {columns.map((c) => <th key={c.key} className={th} style={{ minWidth: 92 }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--table-divider)]">
              {rows.map((r) => (
                <tr key={r.id} style={{ height: ROW_H }} className={r.loading ? 'opacity-50' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} className="num-cell px-3 text-right">
                      <Cell col={c} value={r.data?.[c.key]} base={base?.[c.key]} isBaseline={r.isBaseline} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-3">{t('page_performance_comparison.results_note')}</p>
    </div>
  )
}
