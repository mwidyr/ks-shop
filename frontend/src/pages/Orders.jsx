import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listOrders, updateOrderStatus, getMergeSuggestions, createMergeGroup } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listPickupChains } from '../api/pickupChains'
import { listProducts } from '../api/products'
import { getSummary } from '../api/dashboard'
import { formatCurrency } from '../utils/format'
import StatusPill, { statusLabels } from '../components/StatusPill'
import DateRangePicker from '../components/DateRangePicker'
import BigStatCard from '../components/BigStatCard'
import { IconArrowRight, IconEye } from '../components/icons'

function IconX(props) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const nextStatus = {
  pending: 'picking', picking: 'ready_to_ship', ready_to_ship: 'shipped', shipped: 'delivered',
}

const statusTabs = [
  { key: 'all', value: '', labelKey: 'page_orders.tab_all' },
  { key: 'new', value: 'pending', labelKey: 'page_orders.tab_new_orders' },
  { key: 'picking', value: 'picking', labelKey: 'status.picking' },
  { key: 'ready_to_ship', value: 'ready_to_ship', labelKey: 'status.ready_to_ship' },
  { key: 'shipped', value: 'shipped', labelKey: 'status.shipped' },
  { key: 'delivered', value: 'delivered', labelKey: 'status.delivered' },
  { key: 'cancelled', value: 'cancelled,return', labelKey: 'status.cancelled' },
]

export default function Orders() {
  const { t } = useTranslation()
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 20 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [hostId, setHostId] = useState('')
  const [category, setCategory] = useState('')
  const [pickupChainId, setPickupChainId] = useState('')
  const [blacklistOnly, setBlacklistOnly] = useState(false)
  const [range, setRange] = useState(null)
  const [page, setPage] = useState(1)
  const [advancing, setAdvancing] = useState(null)

  const [hosts, setHosts] = useState([])
  const [pickupChains, setPickupChains] = useState([])
  const [categories, setCategories] = useState([])

  const [selected, setSelected] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  const [mergeSuggestions, setMergeSuggestions] = useState([])
  const [dismissedMerges, setDismissedMerges] = useState(new Set())
  const [mergeModal, setMergeModal] = useState(null)
  const [mergeBusy, setMergeBusy] = useState(false)

  function fetchMergeSuggestions() {
    getMergeSuggestions().then(setMergeSuggestions)
  }

  useEffect(() => {
    listHosts(true).then(setHosts)
    listPickupChains(true).then(setPickupChains)
    listProducts().then((products) => {
      setCategories([...new Set(products.map((p) => p.category).filter(Boolean))])
    })
    fetchMergeSuggestions()
  }, [])

  async function handleMerge(orderIds) {
    setMergeBusy(true)
    try {
      await createMergeGroup(orderIds)
      setMergeModal(null)
      fetchMergeSuggestions()
      fetchOrders()
    } finally {
      setMergeBusy(false)
    }
  }

  function fetchOrders() {
    if (!range) return
    setLoading(true)
    listOrders({
      q: search, status, host_id: hostId, category, pickup_chain_id: pickupChainId,
      blacklist_only: blacklistOnly ? 'true' : '',
      date_from: range.from, date_to: range.to, page, page_size: 20,
    }).then((res) => {
      setData(res)
      setLoading(false)
      setSelected(new Set())
    })
    getSummary(range).then(setSummary)
  }

  useEffect(fetchOrders, [search, status, hostId, category, pickupChainId, blacklistOnly, range, page])

  function resetFilters() {
    setSearch(''); setStatus(''); setHostId(''); setCategory(''); setPickupChainId(''); setBlacklistOnly(false); setPage(1)
  }

  async function handleAdvance(order) {
    const to = nextStatus[order.status]
    if (!to) return
    setAdvancing(order.id)
    try {
      await updateOrderStatus(order.id, to, '')
      fetchOrders()
    } finally {
      setAdvancing(null)
    }
  }

  async function handleReject(order) {
    setAdvancing(order.id)
    try {
      await updateOrderStatus(order.id, 'cancelled', t('page_orders.reject_reason_default'))
      fetchOrders()
    } finally {
      setAdvancing(null)
    }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === data.items.length ? new Set() : new Set(data.items.map((o) => o.id))))
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return
    setBulkBusy(true)
    setBulkResult('')
    const results = await Promise.allSettled(
      [...selected].map((id) => updateOrderStatus(id, bulkStatus, ''))
    )
    const okCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.length - okCount
    setBulkResult(failCount > 0
      ? t('page_orders.bulk_result_partial', { ok: okCount, fail: failCount })
      : t('page_orders.bulk_result_success', { ok: okCount, status: t(`status.${bulkStatus}`, statusLabels[bulkStatus]) }))
    setBulkStatus('')
    setBulkBusy(false)
    fetchOrders()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size))
  const counts = summary?.order_status_counts || {}
  const revenue = summary?.order_status_revenue || {}
  const processing = ['picking', 'ready_to_ship', 'shipped'].reduce((sum, s) => sum + (counts[s] || 0), 0)
  const processingRevenue = ['picking', 'ready_to_ship', 'shipped'].reduce((sum, s) => sum + (revenue[s] || 0), 0)

  const visibleMerges = mergeSuggestions.filter((s) => !dismissedMerges.has(s.customer_id + '-' + s.pickup_store_code))

  return (
    <div className="px-4 sm:px-6 py-6">
      {visibleMerges.map((s) => {
        const key = s.customer_id + '-' + s.pickup_store_code
        return (
          <div key={key} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-amber-800">
              💡 <span className="font-semibold">{t('page_orders.order_count', { count: s.order_nos.length })}</span> {t('page_orders.merge_suggestion_from')} <span className="font-semibold">{s.customer_name}</span> ({s.pickup_chain_name}) {t('page_orders.merge_suggestion_desc', { orderNos: s.order_nos.join(', ') })}
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setMergeModal(s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700">
                {t('page_orders.merge_action')}
              </button>
              <button onClick={() => setDismissedMerges((d) => new Set(d).add(key))} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100">
                {t('page_orders.dismiss')}
              </button>
            </div>
          </div>
        )
      })}

      {mergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMergeModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 mb-2">{t('page_orders.merge_modal_title')}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('page_orders.merge_modal_desc', { count: mergeModal.order_nos.length, customerName: mergeModal.customer_name, chainName: mergeModal.pickup_chain_name })}
            </p>
            <ul className="text-sm text-gray-700 mb-4 list-disc pl-5">
              {mergeModal.order_nos.map((no) => <li key={no}>{no}</li>)}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => handleMerge(mergeModal.order_ids)} disabled={mergeBusy} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
                {mergeBusy ? t('page_orders.merging') : t('page_orders.merge_action')}
              </button>
              <button onClick={() => setMergeModal(null)} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="flex flex-wrap gap-4 mb-6">
          <BigStatCard title={t('page_orders.stat_total_order')} value={Object.values(counts).reduce((a, b) => a + b, 0)} subLabel={t('page_orders.total_qty_sublabel', { count: summary.total_qty })} iconBg="bg-blue-50" iconColor="text-blue-600" icon="📦" />
          <BigStatCard title={t('page_orders.stat_total_revenue')} value={formatCurrency(summary.total_revenue)} iconBg="bg-green-50" iconColor="text-green-600" icon="💰" />
          <BigStatCard title={t('page_orders.stat_pending_confirmation')} value={formatCurrency(revenue.pending || 0)} subLabel={t('page_orders.order_count', { count: counts.pending || 0 })} iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="⏳" />
          <BigStatCard title={t('page_orders.stat_processing')} value={formatCurrency(processingRevenue)} subLabel={t('page_orders.order_count', { count: processing })} iconBg="bg-indigo-50" iconColor="text-indigo-600" icon="🚚" />
          <BigStatCard title={t('status.delivered')} value={formatCurrency(revenue.delivered || 0)} subLabel={t('page_orders.order_count', { count: counts.delivered || 0 })} iconBg="bg-green-50" iconColor="text-green-600" icon="✅" />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(1) }} />
          <Link to="/orders/new" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {t('page_orders.create_order_button')}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('page_orders.search_placeholder')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <select value={hostId} onChange={(e) => { setHostId(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_orders.all_hosts')}</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_orders.all_categories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={pickupChainId} onChange={(e) => { setPickupChainId(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_orders.all_pickup_methods')}</option>
            {pickupChains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => { setBlacklistOnly((v) => !v); setPage(1) }}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
              blacklistOnly ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('page_orders.blacklist_filter')}
          </button>
          <button onClick={resetFilters} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
            {t('page_orders.reset')}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatus(tab.value); setPage(1) }}
              className={`shrink-0 text-sm font-medium px-4 py-1.5 rounded-full border ${
                status === tab.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-brand-800">{t('page_orders.selected_count', { count: selected.size })}</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_orders.change_status_placeholder')}</option>
            {Object.keys(statusLabels).map((s) => <option key={s} value={s}>{t(`status.${s}`, statusLabels[s])}</option>)}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={!bulkStatus || bulkBusy}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
          >
            {bulkBusy ? t('page_orders.applying') : t('shared.apply')}
          </button>
          <a
            href={`/orders/print/invoice?ids=${[...selected].join(',')}`}
            target="_blank" rel="noreferrer"
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
          >
            {t('page_orders.print_selected_invoice')}
          </a>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:underline">
            {t('common.cancel')}
          </button>
        </div>
      )}
      {bulkResult && <p className="text-sm text-gray-600 mb-4">{bulkResult}</p>}

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_orders.loading_orders')}</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_orders.empty_state')}</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={selected.size === data.items.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="p-3">{t('page_orders.col_order_no')}</th>
                  <th className="p-3">{t('page_orders.col_customer')}</th>
                  <th className="p-3">{t('page_orders.col_host')}</th>
                  <th className="p-3">{t('page_orders.col_pickup')}</th>
                  <th className="p-3">{t('page_orders.col_qty')}</th>
                  <th className="p-3">{t('page_orders.col_total')}</th>
                  <th className="p-3">{t('page_orders.col_status')}</th>
                  <th className="p-3">{t('page_orders.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((o) => (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selected.has(o.id) ? 'bg-brand-50/40' : ''}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td className="p-3 font-semibold text-gray-800">{o.order_no}</td>
                    <td className="p-3">
                      <p className="text-gray-700 flex items-center gap-1.5">
                        {o.customer_name}
                        {o.customer_blacklisted && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">{t('page_orders.blacklist_badge')}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{o.customer_phone}</p>
                    </td>
                    <td className="p-3 text-gray-700 font-medium">{o.host_names}</td>
                    <td className="p-3 text-gray-500">
                      {o.pickup_chain_name}
                      {o.pickup_store_code && <span className="font-mono text-xs text-gray-400"> #{o.pickup_store_code}</span>}
                    </td>
                    <td className="p-3 text-gray-500">{o.total_qty}</td>
                    <td className="p-3 font-semibold text-brand-600">{formatCurrency(o.total)}</td>
                    <td className="p-3"><StatusPill status={o.status} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/orders/${o.id}`} title={t('page_orders.view_tooltip')} className="text-gray-400 hover:text-brand-600">
                          <IconEye />
                        </Link>
                        {o.status === 'pending' && (
                          <button
                            onClick={() => handleReject(o)}
                            disabled={advancing === o.id}
                            title={t('page_orders.reject_tooltip')}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <IconX />
                          </button>
                        )}
                        {nextStatus[o.status] && (
                          <button
                            onClick={() => handleAdvance(o)}
                            disabled={advancing === o.id}
                            title={o.status === 'pending' ? t('page_orders.accept_tooltip') : t('page_orders.advance_tooltip', { status: t(`status.${nextStatus[o.status]}`, statusLabels[nextStatus[o.status]]) })}
                            className="text-gray-400 hover:text-brand-600 disabled:opacity-40"
                          >
                            <IconArrowRight />
                          </button>
                        )}
                        <a
                          href={`/orders/${o.id}/print/invoice`}
                          target="_blank" rel="noreferrer"
                          title={t('page_orders.print_invoice_tooltip')}
                          className="text-gray-400 hover:text-brand-600"
                        >
                          🖨️
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>{t('page_orders.pagination_info', { page: data.page, totalPages, total: data.total })}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
              >
                {t('page_orders.prev')}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
              >
                {t('page_orders.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
