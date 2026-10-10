import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLocationShift } from '../api/performanceComparison'
import { formatCurrency } from '../utils/format'
import PeriodPicker, { daysAgoRange } from '../components/PeriodPicker'
import { cardClasses, Metric } from '../components/Table'

const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString())
const fmtDec = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const fmtMoney = (n) => (n == null ? '—' : formatCurrency(Math.round(n)))

function Chevron({ open }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4l6 6-6 6V4z" />
    </svg>
  )
}

// One table row (a parent Location / Website, or one of its children). Parent shares are of the
// company GMV and show a small bar; a child's share is of its parent's GMV.
function Row({ row, label, child, open, onToggle }) {
  const share = Math.max(0, Math.min(100, row.share_pct))
  return (
    <tr className={child ? 'bg-[var(--table-row-hover)]/40' : ''}>
      <td className="py-3 pr-3 whitespace-nowrap">
        {child ? (
          <span className="pl-6 text-[var(--text-secondary)]">↳ {label}</span>
        ) : (
          <button onClick={onToggle} disabled={!row.children?.length} className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
            {row.children?.length ? <Chevron open={open} /> : <span className="w-3.5" />}
            {label}
          </button>
        )}
      </td>
      <td className="py-3 px-2 text-right text-[var(--text-primary)]">{row.live == null ? '—' : fmtInt(row.live)}</td>
      <td className="py-3 px-2 text-right"><Metric type="qty" className="font-semibold">{fmtDec(row.avg_qty)}</Metric></td>
      <td className="py-3 px-2 text-right"><Metric type="ord" className="font-semibold">{fmtDec(row.avg_ord)}</Metric></td>
      <td className="py-3 px-2 text-right"><Metric type="gmv" className="font-semibold">{fmtMoney(row.avg_gmv)}</Metric></td>
      <td className="py-3 px-2 text-right"><Metric type="qty" className="font-semibold">{fmtInt(row.total_qty)}</Metric></td>
      <td className="py-3 px-2 text-right"><Metric type="ord" className="font-semibold">{fmtInt(row.total_ord)}</Metric></td>
      <td className="py-3 px-2 text-right"><Metric type="gmv" className="font-semibold">{fmtInt(Math.round(row.total_gmv))}</Metric></td>
      <td className="py-3 px-2 text-right text-[var(--text-primary)]">{row.aov == null ? '—' : fmtInt(Math.round(row.aov))}</td>
      <td className="py-3 pl-2 text-right" style={{ minWidth: 76 }}>
        <span className="text-[var(--text-primary)] tabular-nums">{fmtDec(row.share_pct)}%</span>
        {!child && (
          <span className="block h-1 rounded-full bg-[var(--table-divider)] mt-1 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${share}%`, background: 'var(--table-accent)' }} />
          </span>
        )}
      </td>
    </tr>
  )
}

export default function PerformanceComparison() {
  const { t } = useTranslation()
  const [range, setRange] = useState(daysAgoRange(6))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sectionOpen, setSectionOpen] = useState(false) // collapsed by default
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => {
    setLoading(true)
    getLocationShift(range).then((d) => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [range])

  const parents = useMemo(() => (data?.rows || []).filter((r) => r.children?.length), [data])
  const allOpen = parents.length > 0 && parents.every((r) => expanded.has(r.key))
  const toggle = (key) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(parents.map((r) => r.key)))

  function childLabel(c) {
    if (c.kind === 'shift') return t(`page_hosts.shift_${c.label}`)
    if (c.kind === 'website_source') return t(c.label === 'self_service' ? 'shared.website_self_service' : 'shared.website_created_by_cs')
    return c.label
  }

  const th = 'py-2 px-2 text-right text-[11px] uppercase text-[var(--text-secondary)] font-medium whitespace-nowrap'

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className={`${cardClasses} p-4 space-y-3`}>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{t('page_performance_comparison.title')}</h1>
          <p className="text-xs text-[var(--text-secondary)]">{t('page_performance_comparison.subtitle')}</p>
        </div>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      <div className={`${cardClasses} overflow-hidden`}>
        <button onClick={() => setSectionOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
          <span className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
            <Chevron open={sectionOpen} />
            {t('page_performance_comparison.section_location_shift')}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">{sectionOpen ? t('page_performance_comparison.collapse') : t('page_performance_comparison.expand')}</span>
        </button>

        {sectionOpen && (
          <div className="border-t border-[var(--table-divider)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs text-[var(--text-secondary)]">{t('page_performance_comparison.all_locations_website')}</p>
              <button onClick={toggleAll} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">
                {allOpen ? t('page_performance_comparison.collapse_all') : t('page_performance_comparison.expand_all')}
              </button>
            </div>
            {loading || !data ? (
              <p className="py-10 text-center text-[var(--text-secondary)]">{t('common.loading')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="border-b border-[var(--table-divider)]">
                      <th className="py-2 pr-3 text-left text-[11px] uppercase text-[var(--text-secondary)] font-medium whitespace-nowrap">{t('page_performance_comparison.col_location_source')}</th>
                      <th className={th}>LIVE</th>
                      <th className={th}>AVG QTY</th>
                      <th className={th}>AVG ORD</th>
                      <th className={th}>AVG GMV</th>
                      <th className={th}>TOTAL QTY</th>
                      <th className={th}>TOTAL ORD</th>
                      <th className={th}>TOTAL GMV</th>
                      <th className={th}>AOV</th>
                      <th className={`${th} pl-2`}>SHARE %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--table-divider)]">
                    {data.rows.map((row) => (
                      <Fragment key={row.key}>
                        <Row row={row} label={row.kind === 'website' ? t('page_performance_comparison.website') : row.label} open={expanded.has(row.key)} onToggle={() => toggle(row.key)} />
                        {expanded.has(row.key) && row.children.map((c) => <Row key={c.key} row={c} label={childLabel(c)} child />)}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[var(--text-secondary)] mt-3">{t('page_performance_comparison.share_note')}</p>
          </div>
        )}
      </div>

      <div className={`${cardClasses} p-5`}>
        <h2 className="font-bold text-[var(--text-primary)]">{t('page_performance_comparison.section_custom')}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t('page_performance_comparison.custom_placeholder')}</p>
      </div>
    </div>
  )
}
