import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSalesDistribution } from '../api/hostAnalytics'
import { formatCurrency } from '../utils/format'
import { cardClasses, Metric } from './Table'

// Sales Distribution Heatmap (Performance History, LIVE only): for each host at each location, how
// many LIVE days fell into each daily-QTY range. The left block (host data) is its own fixed table
// next to the horizontally scrolling heatmap table - no position:sticky - so the two tables use
// the same fixed row/header heights. On mobile the left block shrinks to Host + Location and the
// other data columns scroll together with the heatmap.
const HEAD_H = 40
const ROW_H = 40
const GAP = 2

// Level 1 (lightest, 80% < P <= 100%) ... Level 5 (darkest, 0% < P <= 20%).
const LEVEL_COLORS = ['#F8E8ED', '#EBC1CC', '#D7899F', '#BC4E70', '#9E1B46']

// Per-row colour levels: only positive cells, ranked highest first (equal values share a rank),
// P = rank / number of positive cells * 100.
function rowLevels(buckets) {
  const positive = buckets.filter((v) => v > 0)
  return buckets.map((v) => {
    if (v <= 0) return null
    const rank = 1 + positive.filter((x) => x > v).length
    const p = (rank / positive.length) * 100
    if (p > 80) return 0
    if (p > 60) return 1
    if (p > 40) return 2
    if (p > 20) return 3
    return 4
  })
}

const dec1 = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default function SalesDistributionHeatmap({ filters }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const { locationId, hostId, from, to } = filters

  useEffect(() => {
    setData(null)
    getSalesDistribution({ locationId, hostId, from, to }).then(setData).catch(() => setData({ rows: [], bucket_labels: [] }))
  }, [locationId, hostId, from, to])

  const levels = useMemo(() => (data ? data.rows.map((r) => rowLevels(r.buckets)) : []), [data])

  const head = 'text-[11px] uppercase text-[var(--text-secondary)] font-semibold whitespace-nowrap'
  const metricHeads = [
    { key: 'live', label: t('page_host_analytics.heat_live_days') },
    { key: 'avgq', label: 'AVG QTY' },
    { key: 'avgg', label: 'AVG GMV' },
    { key: 'share', label: 'SHARE %' },
    { key: 'rank', label: 'RANK' },
  ]
  const metricCell = (row, key) => {
    switch (key) {
      case 'live': return <span className="text-[var(--text-primary)]">{row.live_days}</span>
      case 'avgq': return <Metric type="qty">{dec1(row.avg_qty)}</Metric>
      case 'avgg': return <Metric type="gmv">{formatCurrency(Math.round(row.avg_gmv))}</Metric>
      case 'share': return <span className="text-[var(--text-secondary)]">{dec1(row.share_pct)}%</span>
      default: return <span className="text-[var(--text-primary)] font-semibold">#{row.rank}</span>
    }
  }
  const metricWidth = { live: 64, avgq: 64, avgg: 92, share: 72, rank: 56 }

  return (
    <div className={`${cardClasses} p-5`}>
      <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_host_analytics.heat_title')}</h2>
      <p className="text-xs text-[var(--text-secondary)] mb-4">{t('page_host_analytics.heat_hint')}</p>
      {!data ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{t('common.loading')}</p>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{t('page_host_analytics.no_data_in_range')}</p>
      ) : (
        <div className="flex">
          {/* Fixed left block */}
          <table className="text-xs border-separate shrink-0" style={{ borderSpacing: GAP }}>
            <thead>
              <tr style={{ height: HEAD_H }}>
                <th className={`${head} text-left px-2`} style={{ width: 96, minWidth: 96 }}>{t('page_host_analytics.heat_host')}</th>
                <th className={`${head} text-left px-2`} style={{ width: 96, minWidth: 96 }}>{t('page_performance_dashboard.col_location')}</th>
                {metricHeads.map((m) => (
                  <th key={m.key} className={`${head} text-right px-2 hidden md:table-cell`} style={{ width: metricWidth[m.key], minWidth: metricWidth[m.key] }}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.host_id}-${row.location_id}`} style={{ height: ROW_H }}>
                  <td className="px-2 font-medium text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: 96 }}>{row.host_name}</td>
                  <td className="px-2 text-[var(--text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: 96 }}>{row.location_name || '-'}</td>
                  {metricHeads.map((m) => (
                    <td key={m.key} className="px-2 text-right whitespace-nowrap hidden md:table-cell tabular-nums">{metricCell(row, m.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Only this part scrolls horizontally */}
          <div className="overflow-x-auto flex-1 min-w-0">
            <table className="text-xs border-separate" style={{ borderSpacing: GAP }}>
              <thead>
                <tr style={{ height: HEAD_H }}>
                  {metricHeads.map((m) => (
                    <th key={m.key} className={`${head} text-right px-2 md:hidden`} style={{ width: metricWidth[m.key], minWidth: metricWidth[m.key] }}>{m.label}</th>
                  ))}
                  {data.bucket_labels.map((l) => (
                    <th key={l} className={`${head} text-center`} style={{ width: 48, minWidth: 48 }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => (
                  <tr key={`${row.host_id}-${row.location_id}`} style={{ height: ROW_H }}>
                    {metricHeads.map((m) => (
                      <td key={m.key} className="px-2 text-right whitespace-nowrap md:hidden tabular-nums">{metricCell(row, m.key)}</td>
                    ))}
                    {row.buckets.map((v, bi) => {
                      const lv = levels[ri][bi]
                      return (
                        <td
                          key={bi}
                          className={`text-center rounded ${lv == null ? '' : 'font-semibold'}`}
                          style={lv == null ? undefined : { background: LEVEL_COLORS[lv], color: lv === 4 ? '#fff' : '#1f2937' }}
                        >
                          {v > 0 ? v : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
