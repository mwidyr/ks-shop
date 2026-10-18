import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductTrend } from '../api/reports'
import { listHosts } from '../api/hosts'
import { listLocations } from '../api/hostLocations'
import { listAffiliates } from '../api/affiliates'
import PeriodPicker, { useSharedRange } from '../components/PeriodPicker'
import SalesChannelFilter from '../components/SalesChannelFilter'
import { IconChevronDown } from '../components/icons'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'
import { useMasterData } from '../context/MasterDataContext'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../utils/hooks'
import Pager from '../components/Pager'

const PAGE_SIZE = 50
const fmt = (n) => Number(n || 0).toLocaleString()
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString()

// Growth uses the system QTY colour, decline the GMV colour (same palette as the rest of the app).
const changeColor = (n) => (n > 0 ? 'var(--qty-color)' : n < 0 ? 'var(--gmv-color)' : 'var(--text-secondary)')

function Change({ value, className = '' }) {
  return <span className={`font-bold tabular-nums ${className}`} style={{ color: changeColor(value) }}>{signed(value)}</span>
}

// Change % follows the global metric; "—" when the previous period is zero.
function ChangePct({ metric, entry, className = '' }) {
  const prev = entry.prev[metric]
  const diff = entry.cur[metric] - prev
  if (!prev) return <span className={`text-[var(--text-secondary)] ${className}`}>—</span>
  const pct = (diff / prev) * 100
  return <span className={`font-bold tabular-nums ${className}`} style={{ color: changeColor(diff) }}>{pct > 0 ? '+' : pct < 0 ? '−' : ''}{Math.abs(pct).toFixed(1)}%</span>
}

function Section({ title, subtitle, open, onToggle, children, right }) {
  return (
    <div className={`${cardClasses} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <button onClick={onToggle} className="flex items-center gap-2 text-left min-w-0">
          <IconChevronDown width={16} height={16} className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="min-w-0">
            <span className="block font-bold text-[var(--text-primary)]">{title}</span>
            {subtitle && <span className="block text-xs text-[var(--text-secondary)]">{subtitle}</span>}
          </span>
        </button>
        {right}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

function RankingTable({ rows, metric, icon, title, t, translateColor, tone }) {
  return (
    <div className="rounded-xl border border-[var(--table-divider)] overflow-hidden min-w-0">
      <div className="px-3 py-2 font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--table-divider)]">
        <span style={{ color: tone }}>{icon}</span> {title}
      </div>
      <div className="overflow-x-auto">
        <table className={`${tableClasses} min-w-[420px]`}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-2 w-10">{t('page_product_trend.col_rank')}</th>
              <th className="p-2">{t('page_product_trend.col_product_color')}</th>
              <th className="p-2 text-right">{t('page_product_trend.col_qty_change')}</th>
              <th className="p-2 text-right">{t('page_product_trend.col_gmv_change')}</th>
              <th className="p-2 text-right">{t('page_product_trend.col_change_pct')}</th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {rows.map((r, i) => (
              <tr key={r.key} className={rowClasses}>
                <td className="p-2 text-[var(--text-secondary)]">{i + 1}</td>
                <td className="p-2"><span className="font-bold text-[var(--text-primary)]">{r.sku}</span> <span className="text-[var(--text-secondary)]">{translateColor(r.color)}</span></td>
                <td className="p-2 text-right"><Change value={r.cur.qty - r.prev.qty} /></td>
                <td className="p-2 text-right"><Change value={r.cur.gmv - r.prev.gmv} /></td>
                <td className="p-2 text-right"><ChangePct metric={metric} entry={r} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-[var(--text-secondary)]">{t('page_product_trend.no_data')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Two header rows (group + QTY/GMV) shared by the category and product tables.
function CompareHead({ t, firstLabel }) {
  const th = 'p-2 text-right'
  return (
    <thead>
      <tr className={theadRowClasses}>
        <th rowSpan={2} className="p-2 align-bottom">{firstLabel}</th>
        <th colSpan={2} className="p-2 text-center">{t('page_product_trend.col_previous')}</th>
        <th colSpan={2} className="p-2 text-center">{t('page_product_trend.col_current')}</th>
        <th colSpan={2} className="p-2 text-center">{t('page_product_trend.col_change')}</th>
        <th rowSpan={2} className="p-2 text-right align-bottom">{t('page_product_trend.col_change_pct')}</th>
      </tr>
      <tr className={theadRowClasses}>
        <th className={th}>QTY</th><th className={th}>GMV</th>
        <th className={th}>QTY</th><th className={th}>GMV</th>
        <th className={th}>QTY</th><th className={th}>GMV</th>
      </tr>
    </thead>
  )
}

function CompareCells({ entry, metric }) {
  return (
    <>
      <td className="p-2 text-right font-semibold text-[var(--text-primary)]">{fmt(entry.prev.qty)}</td>
      <td className="p-2 text-right font-semibold text-[var(--text-primary)]">{fmt(entry.prev.gmv)}</td>
      <td className="p-2 text-right font-semibold text-[var(--text-primary)]">{fmt(entry.cur.qty)}</td>
      <td className="p-2 text-right font-semibold text-[var(--text-primary)]">{fmt(entry.cur.gmv)}</td>
      <td className="p-2 text-right"><Change value={entry.cur.qty - entry.prev.qty} /></td>
      <td className="p-2 text-right"><Change value={entry.cur.gmv - entry.prev.gmv} /></td>
      <td className="p-2 text-right"><ChangePct metric={metric} entry={entry} /></td>
    </>
  )
}

export default function ProductTrendAnalysis() {
  const { t } = useTranslation()
  const { translateColor, translateCategory } = useMasterData()
  const [range, setRange] = useSharedRange()
  const [channel, setChannel] = useState('all')
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState([])
  const [affiliateId, setAffiliateId] = useState('')
  const [affiliates, setAffiliates] = useState([])
  const [metric, setMetric] = useState('qty')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rankOpen, setRankOpen] = useState(true)
  const [catOpen, setCatOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('all')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [expanded, setExpanded] = useState(null) // product id; only one product open at a time
  const reqId = useRef(0)

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  // Every filter, the metric, the sort and the search live in one key: a new key means page 1,
  // so a change never fires one request for the old page and another for page 1.
  const filterKey = [range.from, range.to, channel, hostId, locationId, affiliateId, metric, sortBy, debouncedSearch].join('|')
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (n) => setPageState({ key: filterKey, page: n })
  // Forget the old page once the key changes, so coming back to a previous key doesn't restore it.
  useEffect(() => { setPageState((p) => (p.key === filterKey ? p : { key: filterKey, page: 1 })) }, [filterKey])

  useEffect(() => { listHosts(true).then(setHosts) }, [])
  useEffect(() => { listLocations().then(setLocations) }, [])
  useEffect(() => { listAffiliates().then(setAffiliates) }, [])

  // Ranking, sorting, search and paging all happen on the server; this page only renders what comes back.
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    getProductTrend({
      date_from: range.from, date_to: range.to,
      host_id: channel === 'live' ? hostId : '', location_id: channel === 'live' ? locationId : '',
      channel, affiliate_id: channel === 'website' ? affiliateId : '',
      metric, sort: sortBy, q: debouncedSearch.trim(), page, page_size: PAGE_SIZE,
    }).then((res) => { if (id === reqId.current) { setData(res); setLoading(false) } })
      .catch(() => { if (id === reqId.current) setLoading(false) })
  }, [filterKey, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const growth = data?.growth || []
  const decline = data?.decline || []
  const categories = data?.categories || []
  const pageRows = data?.products?.items || []
  const total = data?.products?.total || 0

  const rangeLabel = data ? `${data.current.from} – ${data.current.to}  vs  ${data.previous.from} – ${data.previous.to}` : ''

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className={`${cardClasses} p-4 space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SalesChannelFilter
            channel={channel} onChannelChange={setChannel}
            locationId={locationId} onLocationChange={setLocationId} locations={locations}
            hostId={hostId} onHostChange={setHostId} hosts={hosts}
            affiliateId={affiliateId} onAffiliateChange={setAffiliateId} affiliates={affiliates}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-secondary)]">{t('page_product_trend.global_metric')}</span>
            <div className="flex rounded-full border border-[var(--table-divider)] p-0.5">
              {['qty', 'gmv'].map((m) => (
                <button key={m} onClick={() => setMetric(m)} className={`px-4 py-1 rounded-full text-sm font-bold ${metric === m ? 'bg-brand-600 text-white' : 'text-[var(--text-secondary)]'}`}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <PeriodPicker shared value={range} onChange={setRange} />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--text-secondary)]">
          <span>{rangeLabel}</span>
          <span>{t('page_product_trend.same_filters')}</span>
        </div>
      </div>

      {!data ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('common.loading')}</div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity space-y-4' : 'transition-opacity space-y-4'} aria-busy={loading}>
          <Section title={t('page_product_trend.top10_title')} subtitle={t('page_product_trend.top10_sub')} open={rankOpen} onToggle={() => setRankOpen((o) => !o)}>
            <div className="grid lg:grid-cols-2 gap-4">
              <RankingTable rows={growth} metric={metric} icon="↗" tone="var(--qty-color)" title={t('page_product_trend.growth')} t={t} translateColor={translateColor} />
              <RankingTable rows={decline} metric={metric} icon="↘" tone="var(--gmv-color)" title={t('page_product_trend.decline')} t={t} translateColor={translateColor} />
            </div>
          </Section>

          <Section title={t('page_product_trend.category_title')} subtitle={t('page_product_trend.category_sub')} open={catOpen} onToggle={() => setCatOpen((o) => !o)}>
            <div className="overflow-x-auto">
              <table className={`${tableClasses} min-w-[760px]`}>
                <CompareHead t={t} firstLabel={t('page_product_trend.col_category')} />
                <tbody className={tbodyClasses}>
                  {categories.map((c) => (
                    <tr key={c.category} className={rowClasses}>
                      <td className="p-2 font-medium text-[var(--text-primary)]">{translateCategory(c.category)}</td>
                      <CompareCells entry={c} metric={metric} />
                    </tr>
                  ))}
                  {categories.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-[var(--text-secondary)]">{t('page_product_trend.no_data')}</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <div className={`${cardClasses} p-4 space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('page_product_trend.search_placeholder')}
                className="flex-1 min-w-[200px] border border-gray-300 rounded-full px-4 py-2 text-sm bg-transparent"
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border border-gray-300 rounded-full px-3 py-2 text-sm bg-transparent">
                {['all', 'increase', 'decrease', 'current', 'zero'].map((k) => <option key={k} value={k}>{t(`page_product_trend.opt_${k}`)}</option>)}
              </select>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{t('page_product_trend.search_note')}</p>

            <div>
              <h2 className="font-bold text-[var(--text-primary)]">{t('page_product_trend.products_title')}</h2>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_product_trend.products_sub')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className={`${tableClasses} min-w-[860px]`}>
                <CompareHead t={t} firstLabel={t('page_product_trend.col_product')} />
                <tbody className={tbodyClasses}>
                  {pageRows.map((p) => {
                    const open = expanded === p.product_id
                    return (
                      <Fragment key={p.product_id}>
                        <tr className={`${rowClasses} cursor-pointer ${open ? 'bg-[var(--table-row-hover)]' : ''}`} onClick={() => setExpanded(open ? null : p.product_id)}>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <IconChevronDown width={14} height={14} className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? '' : '-rotate-90'}`} />
                              <div>
                                <p className="font-bold text-brand-600">{p.sku}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{p.name}</p>
                              </div>
                            </div>
                          </td>
                          <CompareCells entry={p} metric={metric} />
                        </tr>
                        {open && p.colors.map((c) => (
                          <tr key={`${p.product_id}-${c.color}`} className="bg-black/5">
                            <td className="p-2 pl-9 text-[var(--text-primary)]">{translateColor(c.color) || '—'}</td>
                            <CompareCells entry={c} metric={metric} />
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                  {pageRows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_trend.no_data')}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{t('page_product_trend.count', { count: total })}</p>
            <Pager page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
