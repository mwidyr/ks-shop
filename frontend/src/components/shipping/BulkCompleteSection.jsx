import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { bulkCompleteOrders } from '../../api/shippingWorkbench'
import StatusPill from '../StatusPill'
import { Notice, formatDateTime, primaryBtn } from './shared'

const DAY_MS = 24 * 60 * 60 * 1000

// POS / 郵寄 batches: staff review the batch ~3-4 days after shipment and complete the orders themselves.
// Nothing is completed by elapsed days. Only orders that are Shipped (their latest status from Order
// Management) can be selected; the rest stay visible with their status. The server re-checks every status.
export default function BulkCompleteSection({ orders, batchId, onDone }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const eligible = orders.filter((o) => o.status === 'shipped')
  const eligibleIds = new Set(eligible.map((o) => o.order_id))
  const picked = [...selected].filter((id) => eligibleIds.has(id))
  const allPicked = eligible.length > 0 && picked.length === eligible.length

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(eligibleIds))

  async function complete() {
    if (picked.length === 0 || !window.confirm(t('page_shipping_wb.bulk_confirm', { count: picked.length }))) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await bulkCompleteOrders(batchId, picked))
      setSelected(new Set())
      await onDone?.()
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('page_shipping_wb.err_import_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={allPicked} disabled={eligible.length === 0} onChange={toggleAll} />
          {t('page_shipping_wb.bulk_select_all', { count: eligible.length })}
        </label>
        <button type="button" onClick={complete} disabled={busy || picked.length === 0} className={primaryBtn}>
          {t('page_shipping_wb.bulk_complete_btn')}{picked.length > 0 ? ` (${picked.length})` : ''}
        </button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {result && <Notice tone="info">{t('page_shipping_wb.bulk_done', { completed: result.completed, skipped: result.skipped })}</Notice>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 uppercase border-b">
              <th className="py-1.5 pr-2 w-6" />
              <th className="pr-2">{t('page_shipping_wb.col_order')}</th>
              <th className="pr-2">{t('page_shipping_wb.col_status')}</th>
              <th className="pr-2">{t('page_shipping_wb.bulk_shipped_on')}</th>
              <th>{t('page_shipping_wb.bulk_days')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const can = o.status === 'shipped'
              const days = o.shipped_at ? Math.max(0, Math.floor((Date.now() - new Date(o.shipped_at).getTime()) / DAY_MS)) : null
              return (
                <tr key={o.order_id} className={`border-b last:border-0 ${can ? '' : 'text-gray-400'}`}>
                  <td className="py-1.5 pr-2">
                    <input type="checkbox" disabled={!can} checked={can && selected.has(o.order_id)} onChange={() => toggle(o.order_id)} />
                  </td>
                  <td className="pr-2"><Link to={`/orders/${o.order_id}`} className="font-semibold text-brand-700 hover:underline">{o.order_no}</Link><span className="text-gray-400"> {o.customer_name}</span></td>
                  <td className="pr-2"><StatusPill status={o.status} /></td>
                  <td className="pr-2">{o.shipped_at ? formatDateTime(o.shipped_at) : '-'}</td>
                  <td>{days == null ? '-' : t('page_shipping_wb.bulk_days_value', { count: days })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
