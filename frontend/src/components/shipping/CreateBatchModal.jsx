import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createBatch, listEligible } from '../../api/shippingWorkbench'
import { formatCurrency } from '../../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses } from '../Table'
import { PROVIDERS, batchPath } from './shared'

const QUICK_COUNT = 100

// The batch-creation dialog (the old 匯出超商 modal, reused): lists the provider's orders that can
// go into a NEW batch, sorted into Ready to Export / Problem / Insufficient Stock. Only whole,
// fully-stocked, valid orders created before today (Taiwan time) can be selected.
export default function CreateBatchModal({ provider, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState({ rows: [], today_excluded: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ready')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    listEligible(provider).then((res) => { setData(res); setSelected(new Set()) }).finally(() => setLoading(false))
  }
  useEffect(load, [provider])

  const counts = useMemo(() => {
    const c = { ready: 0, problem: 0, insufficient: 0 }
    data.rows.forEach((r) => { c[r.category] += 1 })
    return c
  }, [data])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.rows.filter((r) => r.category === tab && (!q ||
      r.order_no.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q) ||
      (r.pickup_store_name || '').toLowerCase().includes(q)))
  }, [data, tab, search])

  const selectable = tab === 'ready' ? visible : []
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.order_id))
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.order_id)))
  // rows are oldest first, so the first N are the oldest eligible orders
  const selectOldest = () => setSelected(new Set(selectable.slice(0, QUICK_COUNT).map((r) => r.order_id)))

  const pickedRows = data.rows.filter((r) => r.category === 'ready' && selected.has(r.order_id))
  const orderCount = pickedRows.reduce((s, r) => s + r.order_ids.length, 0)

  async function handleCreate() {
    setBusy(true)
    setError('')
    try {
      const res = await createBatch(provider, pickedRows.flatMap((r) => r.order_ids))
      navigate(batchPath(provider, res.id))
    } catch (err) {
      setError(err.response?.data?.error || t('page_shipping_wb.err_create_batch'))
      load() // stock or orders changed underneath - show the fresh state
    } finally {
      setBusy(false)
    }
  }

  const tabs = [['ready', 'tab_ready'], ['problem', 'tab_problem'], ['insufficient', 'tab_insufficient']]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg text-gray-800">
              {t('page_shipping_wb.create_batch_title')} · {t(`page_shipping_wb.${PROVIDERS[provider].nameKey}`)}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{t('page_shipping_wb.create_batch_desc')}</p>
          {data.today_excluded > 0 && (
            <p className="text-xs text-gray-400 mt-1">{t('page_shipping_wb.today_excluded', { count: data.today_excluded })}</p>
          )}
        </div>

        <div className="p-5 pb-3 shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page_shipping_wb.search_orders')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="px-5 flex gap-4 border-b border-gray-100 overflow-x-auto shrink-0">
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`shrink-0 pb-2 text-sm font-semibold border-b-2 ${tab === key ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400'}`}>
              {t(`page_shipping_wb.${label}`)} {counts[key]}
            </button>
          ))}
        </div>

        {tab === 'ready' && (
          <div className="px-5 py-3 flex flex-wrap items-center gap-3 shrink-0">
            <button type="button" onClick={selectOldest} disabled={selectable.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              {t('page_shipping_wb.select_oldest', { count: Math.min(QUICK_COUNT, selectable.length) })}
            </button>
          </div>
        )}
        {tab === 'insufficient' && <p className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shrink-0">{t('page_shipping_wb.insufficient_note')}</p>}
        {tab === 'problem' && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shrink-0">{t('page_shipping_wb.problem_note')}</p>}

        <div className="flex-1 overflow-y-auto px-5 mt-2">
          {loading ? (
            <p className="text-center text-gray-400 py-8">{t('common.loading')}</p>
          ) : visible.length === 0 ? (
            <p className="text-center text-gray-400 py-8">{t('page_shipping_wb.no_orders')}</p>
          ) : (
            <table className={tableClasses}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="py-2 w-8">
                    {tab === 'ready' && <input type="checkbox" checked={allSelected} onChange={toggleAll} />}
                  </th>
                  <th className="py-2">{t('page_shipping_wb.col_order')}</th>
                  <th className="py-2">{t('page_shipping_wb.col_store')}</th>
                  <th className="py-2">{t('page_shipping_wb.col_total')}</th>
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {visible.map((r) => (
                  <tr key={r.order_id} className={rowClasses}>
                    <td className="py-2">
                      <input type="checkbox" disabled={tab !== 'ready'} checked={selected.has(r.order_id)} onChange={() => toggle(r.order_id)} />
                    </td>
                    <td className="py-2">
                      <p className="font-medium text-[var(--text-primary)]">{r.customer_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{r.order_no} · {r.order_date}</p>
                      {r.group_order_nos?.length > 0 && (
                        <p className="text-[10px] font-semibold text-amber-600">{t('page_shipping_wb.merged_note', { count: r.group_order_nos.length })}</p>
                      )}
                      {r.problems.map((p) => (
                        <p key={p} className="text-[11px] font-semibold text-red-600">⚠ {t(`page_shipping_wb.problem_${p}`)}</p>
                      ))}
                      {r.shortages.map((s) => (
                        <p key={s.sku} className="text-[11px] font-semibold text-amber-700">
                          {t('page_shipping_wb.short_line', { sku: s.sku, need: s.need, have: s.have })}
                        </p>
                      ))}
                    </td>
                    <td className="py-2">
                      <p className="text-[var(--text-primary)]">{r.is_home_delivery ? r.shipping_address : r.pickup_store_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{r.is_home_delivery ? r.customer_phone : r.pickup_store_code}</p>
                    </td>
                    <td className="py-2 text-[var(--text-primary)]">{formatCurrency(r.total_to_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {error && <p className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shrink-0">{error}</p>}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.cancel')}</button>
          <button onClick={handleCreate} disabled={orderCount === 0 || busy} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {t('page_shipping_wb.create_batch_button', { count: orderCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
