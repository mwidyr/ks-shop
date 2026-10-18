import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { listCustomerStats, getCustomerDetail, setCustomerLabel, deleteCustomer } from '../api/customers'
import { formatCurrency } from '../utils/format'
import { jakartaIsoDate } from '../utils/jakartaDate'
import StatusPill from '../components/StatusPill'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'
import { useCanEdit } from '../context/AccessContext'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../utils/hooks'

// The old manual "VIP" label is gone: VIP is now an automatic tier (cumulative valid spending of
// NT$3,000 or more), computed by the backend. The other labels stay manual.
const availableLabels = [
  { key: 'blacklist', labelKey: 'blacklist' },
  { key: 'pelanggan_baru', labelKey: 'new_customer' },
]

const nt = (n) => `NT$ ${formatCurrency(n || 0)}`
const fmtDate = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}
// Where the parcel goes: "store name #code" for a store (unverified stores show as typed), else the address.
const deliveryText = (d) => {
  if (!d) return ''
  if (d.store_name || d.store_code) return `${d.store_name || ''}${d.store_code ? ` #${d.store_code}` : ''}`.trim()
  return d.address || ''
}
const fmtDays = (n) => (n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}`)

function TierBadge({ tier }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${tier === 'vip' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
      {tier === 'vip' ? '★ ' : ''}{t(`page_customers.tier_${tier}`)}
    </span>
  )
}

function KpiCard({ label, value }) {
  return (
    <div className={`${cardClasses} p-4`}>
      <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{label}</p>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function CustomerDetail({ customer, onClose, onChanged }) {
  const canEdit = useCanEdit()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [extra, setExtra] = useState(null)
  const [showAllDelivery, setShowAllDelivery] = useState(false)
  const [labels, setLabels] = useState(new Set(customer.labels || []))
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    getCustomerDetail(customer.id).then(setExtra).catch(() => setExtra({ delivery_history: [], host_history: [], orders: [] }))
  }, [customer.id])

  async function toggleLabel(key) {
    const enabled = !labels.has(key)
    await setCustomerLabel(customer.id, key, enabled)
    setLabels((s) => {
      const next = new Set(s)
      if (enabled) next.add(key)
      else next.delete(key)
      return next
    })
    onChanged()
  }

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteCustomer(customer.id)
      onChanged()
      onClose()
    } catch (err) {
      setDeleteError(err.response?.data?.error || t('page_customers.detail.delete_error_fallback'))
    }
  }

  const orders = extra ? extra.orders || [] : null
  const delivery = extra?.delivery_history || []
  const shownDelivery = showAllDelivery ? delivery : delivery.slice(0, 1)

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--table-card-bg)] h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{customer.name}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">{t('common.close')}</button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-1">{customer.phone}</p>
        <p className="text-sm text-[var(--text-secondary)] mb-3">{customer.address || '-'}</p>
        <div className="mb-4"><TierBadge tier={customer.tier} /></div>

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">{t('page_customers.detail.label_heading')}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {availableLabels.map((l) => (
            <button
              key={l.key}
              onClick={() => toggleLabel(l.key)}
              disabled={!canEdit}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                labels.has(l.key)
                  ? l.key === 'blacklist' ? 'bg-red-600 border-red-600 text-white' : 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t(`page_customers.labels.${l.labelKey}`)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 uppercase">{t('page_customers.detail.total_order')}</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{customer.order_count}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 uppercase">{t('page_customers.detail.lifetime_value')}</p>
            <p className="text-lg font-bold text-brand-600">{nt(customer.total_spend)}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-6">
          <p className="text-[11px] text-gray-400 uppercase">{t('page_customers.detail.avg_cycle')}</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {fmtDays(customer.avg_repurchase_cycle_days)}
            {customer.avg_repurchase_cycle_days != null && <span className="text-sm font-medium text-[var(--text-secondary)]"> {t('page_customers.days_suffix')}</span>}
          </p>
        </div>

        {/* Delivery history: latest first, each store/address once, expandable */}
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{t('page_customers.detail.delivery_history')}</h3>
        {!extra ? (
          <p className="text-sm text-gray-400 mb-6">{t('common.loading')}</p>
        ) : delivery.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">{t('page_customers.detail.delivery_none')}</p>
        ) : (
          <div className="mb-6">
            <ul className="space-y-2">
              {shownDelivery.map((d, i) => (
                <li key={`${d.chain_name}-${d.store_code}-${d.address}`} className="border border-[var(--table-divider)] rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{d.chain_name}</span>
                    {i === 0 && !showAllDelivery && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{t('page_customers.detail.delivery_latest')}</span>}
                  </div>
                  {(d.store_name || d.store_code) && (
                    <p className="text-[var(--text-secondary)]">{d.store_name}{d.store_code && <span className="font-mono"> #{d.store_code}</span>}</p>
                  )}
                  {d.address && <p className="text-[var(--text-secondary)]">{d.address}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{fmtDate(d.last_used_at)} · {t('page_customers.detail.delivery_used_times', { count: d.times_used })}</p>
                </li>
              ))}
            </ul>
            {delivery.length > 1 && (
              <button onClick={() => setShowAllDelivery((v) => !v)} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">
                {showAllDelivery ? t('page_customers.detail.delivery_hide') : t('page_customers.detail.delivery_show_all', { count: delivery.length })}
              </button>
            )}
          </div>
        )}

        {/* Host purchase history: orders per host (Website is a virtual host), most orders first */}
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{t('page_customers.detail.host_history')}</h3>
        {!extra ? (
          <p className="text-sm text-gray-400 mb-6">{t('common.loading')}</p>
        ) : (extra.host_history || []).length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">{t('page_customers.detail.host_none')}</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-6">
            {extra.host_history.map((h) => (
              <span key={h.host} className="text-sm px-3 py-1 rounded-full border border-[var(--table-divider)] text-[var(--text-primary)]">
                {h.host} <span className="font-semibold text-brand-600">×{h.orders}</span>
              </span>
            ))}
          </div>
        )}

        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{t('page_customers.detail.order_history')}</h3>
        {!orders ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">{t('page_customers.detail.no_orders')}</p>
        ) : (
          <div className="divide-y divide-[var(--table-divider)]">
            {orders.map((o) => (
              <div key={o.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${o.id}`)}
                    title={t('page_customers.detail.open_order')}
                    className="font-medium text-brand-600 hover:underline inline-flex items-center gap-1"
                  >
                    {o.order_no}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                  </button>
                  <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[var(--text-primary)]">{nt(o.total)}</p>
                  <StatusPill status={o.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && <div className="mt-8 border border-red-200 bg-red-50 rounded-xl p-4">
          <p className="text-xs font-bold text-red-600 uppercase mb-2">{t('page_customers.detail.danger_zone')}</p>
          <button onClick={handleDelete} className="w-full text-sm font-semibold text-red-600 border border-red-300 rounded-lg py-2 hover:bg-red-100">
            {t('page_customers.detail.delete_customer')}
          </button>
          {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
        </div>}
      </div>
    </div>
  )
}

const emptyFilters = { minOrders: '', maxOrders: '', minLtv: '', maxLtv: '', tier: '', from: '', to: '' }

const SORTS = {
  last_desc: { key: 'last', dir: -1 }, last_asc: { key: 'last', dir: 1 },
  orders_desc: { key: 'orders', dir: -1 }, orders_asc: { key: 'orders', dir: 1 },
  ltv_desc: { key: 'ltv', dir: -1 }, ltv_asc: { key: 'ltv', dir: 1 },
}
const PAGE_SIZE = 25

// The filters in the names the API expects.
const filterParams = (f) => ({
  min_orders: f.minOrders, max_orders: f.maxOrders, min_spend: f.minLtv, max_spend: f.maxLtv, tier: f.tier, from: f.from, to: f.to,
})

export default function Customers() {
  const { t } = useTranslation()
  const [data, setData] = useState({ kpi: null, customers: [], total: 0, page: 1, page_size: PAGE_SIZE })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState('last_desc') // default: most recent purchase first
  const [selected, setSelected] = useState(null)

  // Search, filters and sort are applied by the server, one page at a time. Only the newest request
  // may write its result, and the previous page stays on screen (dimmed) while the next one loads.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const requestId = useRef(0)
  const [fetching, setFetching] = useState(false)
  const queryParams = () => ({ q: debouncedSearch.trim(), sort, ...filterParams(filters) })
  function reload() {
    const id = ++requestId.current
    setFetching(true)
    listCustomerStats({ ...queryParams(), page, page_size: PAGE_SIZE }).then((res) => {
      if (id !== requestId.current) return
      setData(res)
      setLoading(false)
      setFetching(false)
      setSelected((cur) => (cur ? res.customers.find((c) => c.id === cur.id) || cur : null))
    }).catch(() => { if (id === requestId.current) { setLoading(false); setFetching(false) } })
  }
  useEffect(reload, [debouncedSearch, filters, sort, page])
  const changeSearch = (v) => { setSearch(v); setPage(1) }

  const setF = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1) }
  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length

  const list = data.customers
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  const [exporting, setExporting] = useState(false)
  // Exports every customer matching the current search / filters / sort (not just the page on screen):
  // same columns as the table, plus the average cycle, the delivery destination split into city/county
  // and the LAST order only.
  async function exportExcel() {
    setExporting(true)
    try {
      const [XLSX, all] = await Promise.all([import('xlsx'), listCustomerStats({ ...queryParams(), export: 1 })])
      const c = (key) => t(`page_customers.export_cols.${key}`)
      const rows = all.customers.map((r) => {
        const d = r.last_delivery
        const lo = r.last_order
        return {
          [t('page_customers.table.name')]: r.name,
          [t('page_customers.table.phone')]: r.phone,
          [t('page_customers.table.orders')]: r.order_count,
          [t('page_customers.table.total_spending')]: r.total_spend,
          [t('page_customers.table.last_order')]: fmtDate(r.last_order_at),
          [t('page_customers.table.segment')]: t(`page_customers.tier_${r.tier}`),
          [c('avg_cycle')]: r.avg_repurchase_cycle_days == null ? '' : Number(r.avg_repurchase_cycle_days.toFixed(1)),
          [c('chain')]: d?.chain_name || '',
          [c('store_name')]: d?.store_name || '',
          [c('store_code')]: d?.store_code || '',
          [c('verified')]: d && (d.store_name || d.store_code) ? (d.store_verified ? c('yes') : c('no')) : '',
          [c('address')]: d?.address || '',
          [c('city')]: d?.city || '',
          [c('district')]: d?.district || '',
          [c('lo_order_no')]: lo?.order_no || '',
          [c('lo_date')]: lo ? fmtDate(lo.created_at) : '',
          [c('lo_status')]: lo?.status || '',
          [c('lo_total')]: lo ? lo.total : '',
          [c('lo_items')]: lo?.items || '',
          [c('lo_chain')]: lo?.chain_name || '',
          [c('lo_store')]: lo?.store_name || '',
          [c('lo_store_code')]: lo?.store_code || '',
          [c('lo_address')]: lo?.address || '',
        }
      })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Customers')
      XLSX.writeFile(wb, `customers-${jakartaIsoDate(new Date())}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  // Desktop header click: same column toggles direction, a new column starts at its natural order.
  function headerSort(key) {
    const cur = SORTS[sort]
    if (cur.key === key) setSort(`${key}_${cur.dir === -1 ? 'asc' : 'desc'}`)
    else setSort(`${key}_desc`)
    setPage(1)
  }
  const arrow = (key) => (SORTS[sort].key === key ? (SORTS[sort].dir === -1 ? ' ↓' : ' ↑') : '')

  const k = data.kpi
  const days = t('page_customers.days_suffix')

  return (
    <div className="px-4 sm:px-6 py-6">
      <h2 className="font-bold text-[var(--text-primary)] mb-3">{t('page_customers.kpi_title')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <KpiCard label={t('page_customers.kpi_total')} value={k ? formatCurrency(k.total_customers) : '—'} />
        <KpiCard label={t('page_customers.kpi_returning')} value={k ? formatCurrency(k.returning_customers) : '—'} />
        <KpiCard label={t('page_customers.kpi_repeat_rate')} value={k?.repeat_purchase_rate != null ? `${k.repeat_purchase_rate.toFixed(1)}%` : '—'} />
        <KpiCard label={t('page_customers.kpi_cycle')} value={k?.repurchase_cycle_days != null ? `${fmtDays(k.repurchase_cycle_days)} ${days}` : '—'} />
        <KpiCard label={t('page_customers.kpi_aov')} value={k?.aov != null ? nt(k.aov) : '—'} />
        <KpiCard label={t('page_customers.kpi_ltv')} value={k?.ltv != null ? nt(k.ltv) : '—'} />
      </div>

      <div className={`${cardClasses} p-4 mb-4`}>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder={t('page_customers.search_placeholder')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
          />
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${filterOpen || activeFilterCount ? 'border-brand-600 text-brand-700 bg-brand-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {t('page_customers.filter_button')}{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || data.total === 0}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? t('page_customers.exporting') : t('page_customers.export')}
          </button>
          {/* Mobile: a plain "Sort By" dropdown (desktop sorts via the column headers) */}
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label={t('page_customers.sort_by')} className="md:hidden border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full">
            {Object.keys(SORTS).map((s) => <option key={s} value={s}>{t(`page_customers.sort_${s}`)}</option>)}
          </select>
        </div>

        {filterOpen && (
          <div className="mt-4 pt-4 border-t border-[var(--table-divider)] grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_customers.filter_orders')}</p>
              <div className="flex gap-2">
                <input type="number" min="0" placeholder={t('page_customers.filter_min')} value={filters.minOrders} onChange={setF('minOrders')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
                <input type="number" min="0" placeholder={t('page_customers.filter_max')} value={filters.maxOrders} onChange={setF('maxOrders')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_customers.filter_ltv')}</p>
              <div className="flex gap-2">
                <input type="number" min="0" placeholder={t('page_customers.filter_min')} value={filters.minLtv} onChange={setF('minLtv')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
                <input type="number" min="0" placeholder={t('page_customers.filter_max')} value={filters.maxLtv} onChange={setF('maxLtv')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_customers.filter_tier')}</p>
              <select value={filters.tier} onChange={setF('tier')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5">
                <option value="">{t('page_customers.filter_tier_all')}</option>
                <option value="regular">{t('page_customers.tier_regular')}</option>
                <option value="vip">{t('page_customers.tier_vip')}</option>
                <option value="blacklist">{t('page_customers.labels.blacklist')}</option>
              </select>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_customers.filter_last_purchase')}</p>
              <div className="flex gap-2">
                <input type="date" aria-label={t('page_customers.filter_from')} value={filters.from} onChange={setF('from')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
                <input type="date" aria-label={t('page_customers.filter_to')} value={filters.to} onChange={setF('to')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">{t('page_customers.results_count', { count: list.length })}</span>
              <button onClick={() => { setFilters(emptyFilters); setPage(1) }} className="text-xs font-semibold text-brand-600 hover:underline">{t('page_customers.filter_reset')}</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_customers.loading_customers')}</p>
      ) : list.length === 0 && !fetching ? (
        <div className={`${cardClasses} p-10 text-center text-[var(--text-secondary)]`}>{t('page_customers.no_results')}</div>
      ) : (
        <div className={fetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={fetching}>
          <div className={`${cardClasses} overflow-x-auto hidden md:block`}>
            <table className={tableClasses}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="p-3.5">{t('page_customers.table.name')}</th>
                  <th className="p-3.5">{t('page_customers.table.phone')}</th>
                  <th className="p-3.5 cursor-pointer select-none" onClick={() => headerSort('orders')}>{t('page_customers.table.orders')}{arrow('orders')}</th>
                  <th className="p-3.5 cursor-pointer select-none" onClick={() => headerSort('ltv')}>{t('page_customers.table.total_spending')}{arrow('ltv')}</th>
                  <th className="p-3.5 cursor-pointer select-none" onClick={() => headerSort('last')}>{t('page_customers.table.last_order')}{arrow('last')}</th>
                  <th className="p-3.5">{t('page_customers.table.segment')}</th>
                  <th className="p-3.5">{t('page_customers.table_last_store')}</th>
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {list.map((c) => (
                  <tr key={c.id} className={`${rowClasses} cursor-pointer`} onClick={() => setSelected(c)}>
                    <td className="p-3.5 font-medium text-[var(--text-primary)]">{c.name}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{c.phone}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{c.order_count}</td>
                    <td className="p-3.5 font-semibold text-brand-600">{nt(c.total_spend)}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{fmtDate(c.last_order_at)}</td>
                    <td className="p-3.5"><TierBadge tier={c.tier} /></td>
                    <td className="p-3.5 text-[var(--text-secondary)] max-w-[260px] truncate" title={deliveryText(c.last_delivery)}>{deliveryText(c.last_delivery) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same information as compact cards */}
          <div className="md:hidden space-y-2">
            {list.map((c) => (
              <div key={c.id} onClick={() => setSelected(c)} className={`${cardClasses} p-3.5 cursor-pointer`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                  <TierBadge tier={c.tier} />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{c.phone}</p>
                {deliveryText(c.last_delivery) && <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{deliveryText(c.last_delivery)}</p>}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{c.order_count} {t('page_customers.table.orders').toLowerCase()} · {fmtDate(c.last_order_at)}</span>
                  <span className="font-bold text-brand-600 text-sm">{nt(c.total_spend)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-[var(--text-secondary)]">
            <span>{t('page_orders.pagination_info', { page: data.page, totalPages, total: data.total })}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-[var(--table-divider)] disabled:opacity-40">{t('page_orders.prev')}</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-[var(--table-divider)] disabled:opacity-40">{t('page_orders.next')}</button>
            </div>
          </div>
        </div>
      )}

      {selected && <CustomerDetail key={selected.id} customer={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  )
}
