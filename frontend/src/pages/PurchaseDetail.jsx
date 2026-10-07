import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getPurchase, updatePurchase, updatePurchaseStatus, deletePurchase,
  addPurchaseBatch, updatePurchaseBatch, deletePurchaseBatch, confirmPurchaseBatch,
} from '../api/purchases'
import { formatCNY } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, cardClasses } from '../components/Table'
import { IconTrash } from '../components/icons'
import { useMasterData } from '../context/MasterDataContext'
import { purchaseStatusColors } from './Purchases'

const isOpen = (status) => status === 'ordered' || status === 'pending_arrival' || status === 'partially_received'

// One delivery batch row: Planned QTY (typed by hand, saved on blur), Actual Received QTY
// (defaults to the planned qty until edited) and the "Received" checkbox, which confirms the batch
// and moves its actual qty from Incoming to Actual Stock.
function BatchRow({ batch, canEdit, canDelete, onChanged, onError }) {
  const { t } = useTranslation()
  const [planned, setPlanned] = useState(String(batch.planned_qty))
  const [actual, setActual] = useState(null) // null = follow planned
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPlanned(String(batch.planned_qty)) }, [batch.planned_qty])
  const actualValue = batch.is_received ? batch.received_qty : (actual ?? planned)

  async function savePlanned() {
    const n = Number(planned)
    if (!Number.isFinite(n) || n < 0 || n === batch.planned_qty) { setPlanned(String(batch.planned_qty)); return }
    try { await updatePurchaseBatch(batch.id, n); onChanged() } catch (err) { onError(err.response?.data?.error || t('page_purchases.batch_save_failed')) }
  }

  async function confirm() {
    setBusy(true)
    onError('')
    try {
      await confirmPurchaseBatch(batch.id, Number(actualValue))
      onChanged()
    } catch (err) {
      onError(err.response?.data?.error || t('page_purchases.batch_confirm_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try { await deletePurchaseBatch(batch.id); onChanged() } catch (err) { onError(err.response?.data?.error || t('page_purchases.delete_failed')) }
  }

  return (
    <tr>
      <td className="p-2 pl-4 text-[var(--text-primary)]">{t('page_purchases.batch_label', { n: batch.batch_no })}</td>
      <td className="p-2">
        {batch.is_received || !canEdit ? (
          <span className="text-[var(--text-secondary)]">{batch.planned_qty}</span>
        ) : (
          <input type="number" min="0" value={planned} onChange={(e) => setPlanned(e.target.value)} onBlur={savePlanned}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        )}
      </td>
      <td className="p-2">
        {batch.is_received ? (
          <span className="font-bold text-green-600">{batch.received_qty}</span>
        ) : (
          <input type="number" min="0" value={actualValue} disabled={!canEdit} onChange={(e) => setActual(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold" />
        )}
      </td>
      <td className="p-2 text-center">
        <input type="checkbox" checked={batch.is_received} disabled={batch.is_received || !canEdit || busy || !(Number(actualValue) > 0)}
          onChange={confirm} aria-label={t('page_purchases.col_received')} className="w-4 h-4" />
      </td>
      <td className="p-2 pr-4 text-right">
        {canDelete && !batch.is_received && (
          <button onClick={remove} title={t('page_purchases.delete_batch')} className="text-gray-400 hover:text-red-600"><IconTrash width={14} height={14} /></button>
        )}
      </td>
    </tr>
  )
}

function ItemBatches({ item, canEdit, onChanged, onError }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function addBatch() {
    setBusy(true)
    onError('')
    try { await addPurchaseBatch(item.id, 0); onChanged() } catch (err) { onError(err.response?.data?.error || t('page_purchases.batch_save_failed')) } finally { setBusy(false) }
  }

  const multi = item.batches.length > 1
  return (
    <div className="mt-2 ml-4 mr-4 mb-3 border border-[var(--table-divider)] rounded-lg overflow-hidden">
      <table className={tableClasses}>
        <thead>
          <tr className={theadRowClasses}>
            <th className="p-2 pl-4">{t('page_purchases.col_batch')}</th>
            <th className="p-2">{t('page_purchases.col_planned_qty')}</th>
            <th className="p-2">{t('page_purchases.col_actual_received_qty')}</th>
            <th className="p-2 text-center">{t('page_purchases.col_received')}</th>
            <th className="p-2 pr-4"></th>
          </tr>
        </thead>
        <tbody className={tbodyClasses}>
          {item.batches.map((b) => (
            <BatchRow key={b.id} batch={b} canEdit={canEdit} canDelete={canEdit && multi} onChanged={onChanged} onError={onError} />
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-t border-[var(--table-divider)]">
        {item.plan_mismatch
          ? <p className="text-xs text-amber-600">⚠ {t('page_purchases.batch_plan_warning', { plan: item.plan_total, qty: item.qty })}</p>
          : <span />}
        {canEdit && (
          <button onClick={addBatch} disabled={busy} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40">
            {multi ? t('page_purchases.add_batch') : t('page_purchases.split_delivery')}
          </button>
        )}
      </div>
    </div>
  )
}

// Full detail page for ONE supplier order (replaces the old popup): header, products, and under
// each product its delivery batches. Receiving happens here, per batch - the PO status goes
// Waiting for Delivery -> Partially Received -> Received on its own.
export default function PurchaseDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { translateColor } = useMasterData()
  const [purchase, setPurchase] = useState(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  function reload() {
    return getPurchase(id).then(setPurchase).catch(() => setMissing(true))
  }
  useEffect(() => { setPurchase(null); setMissing(false); reload() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <div className="px-6 py-16 text-center text-gray-500">{t('page_purchases.not_found')}</div>
  if (!purchase) return <div className="px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  const open = isOpen(purchase.status)
  const waiting = purchase.status === 'ordered' || purchase.status === 'pending_arrival'
  const total = purchase.items.reduce((s, it) => s + it.qty * it.unit_cost, 0)
  const totalQty = purchase.items.reduce((s, it) => s + it.qty, 0)
  const receivedQty = purchase.items.reduce((s, it) => s + (it.received_qty || 0), 0)

  function startEdit() {
    setForm({
      expected_arrival_date: purchase.expected_arrival_date || '',
      notes: purchase.notes || '',
      items: purchase.items.map((it) => ({ id: it.id, qty: it.qty, unit_cost: it.unit_cost })),
    })
    setEditing(true)
  }

  async function run(fn) {
    setBusy(true)
    setError('')
    try { await fn() } catch (err) { setError(err.response?.data?.error || t('page_purchases.delete_failed')) } finally { setBusy(false) }
  }

  const saveEdit = () => run(async () => { await updatePurchase(purchase.id, form); setEditing(false); await reload() })
  const changeStatus = (status) => run(async () => { await updatePurchaseStatus(purchase.id, status); await reload() })
  const remove = () => run(async () => { await deletePurchase(purchase.id); navigate('/purchases') })

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl space-y-4">
      <button onClick={() => navigate('/purchases')} className="text-sm text-gray-500 hover:text-gray-800">← {t('page_purchases.back_to_list')}</button>

      <div className={`${cardClasses} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-[var(--text-primary)]">{purchase.po_number}</h2>
            {waiting ? (
              <select value={purchase.status} onChange={(e) => changeStatus(e.target.value)} disabled={busy}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border-0 ${purchaseStatusColors[purchase.status]}`}>
                <option value="ordered">{t('page_purchases.status_ordered')}</option>
                <option value="pending_arrival">{t('page_purchases.status_pending_arrival')}</option>
                <option value="cancelled">{t('page_purchases.status_cancelled')}</option>
              </select>
            ) : (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${purchaseStatusColors[purchase.status]}`}>{t(`page_purchases.status_${purchase.status}`)}</span>
            )}
          </div>
          <div className="flex gap-2">
            {open && !editing && <button onClick={startEdit} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">{t('common.edit')}</button>}
            {purchase.status === 'partially_received' && (
              <button onClick={() => changeStatus('cancelled')} disabled={busy} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-red-600 hover:underline">{t('page_purchases.cancel_order_button')}</button>
            )}
            {waiting && <button onClick={remove} disabled={busy} className="text-sm font-semibold px-3 py-1.5 text-red-600 hover:underline">{t('common.delete')}</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.th_supplier')}</p><p className="text-gray-700">{purchase.supplier_name}</p></div>
          <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.label_order_date').replace(' *', '')}</p><p className="text-gray-700">{purchase.order_date}</p></div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.label_expected_arrival')}</p>
            {editing
              ? <input type="date" value={form.expected_arrival_date} onChange={(e) => setForm((f) => ({ ...f, expected_arrival_date: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
              : <p className="text-gray-700">{purchase.expected_arrival_date || '-'}</p>}
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.source_pr_label')}</p>
            {purchase.source_pr_no
              ? <Link to={`/purchase-requisitions/${purchase.source_pr_id}`} className="font-mono text-xs text-brand-600 hover:underline">{purchase.source_pr_no}</Link>
              : <p className="text-gray-700">-</p>}
          </div>
        </div>
        <div className="mt-3 text-sm">
          <p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.label_notes')}</p>
          {editing
            ? <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            : <p className="text-gray-700 whitespace-pre-line">{purchase.notes || '–'}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 mt-3 border-t border-gray-100">
          <div><p className="text-lg font-bold text-gray-800">{purchase.items.length}</p><p className="text-xs text-gray-400">{t('page_purchases.items_title')}</p></div>
          <div><p className="text-lg font-bold text-gray-800">{receivedQty} / {totalQty}</p><p className="text-xs text-gray-400">{t('page_purchases.received_vs_ordered')}</p></div>
          <div><p className="text-lg font-bold text-brand-600">{formatCNY(total)}</p><p className="text-xs text-gray-400">{t('page_purchases.th_total_cost')}</p></div>
        </div>
        {open && <p className="text-xs text-gray-400 mt-3">{t('page_purchases.receiving_hint')}</p>}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        {editing && (
          <div className="flex gap-2 mt-3">
            <button onClick={saveEdit} disabled={busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">{t('common.save')}</button>
            <button onClick={() => setEditing(false)} className="text-gray-500 text-sm font-semibold px-5 py-2 hover:underline">{t('common.cancel')}</button>
          </div>
        )}
      </div>

      <div className={`${cardClasses} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className={tableClasses}>
            <thead>
              <tr className={theadRowClasses}>
                <th className="p-2 pl-4">{t('page_purchases.col_product_code')}</th>
                <th className="p-2">{t('page_purchases.col_product_name')}</th>
                <th className="p-2">{t('page_purchases.col_color_size')}</th>
                <th className="p-2">{t('page_purchases.col_order_qty')}</th>
                <th className="p-2">{t('page_purchases.col_unit_cost')}</th>
                <th className="p-2 pr-4">{t('page_purchases.col_amount')}</th>
              </tr>
            </thead>
            {purchase.items.map((it) => {
              const f = editing ? form.items.find((x) => x.id === it.id) : null
              const qty = f ? Number(f.qty) || 0 : it.qty
              const cost = f ? Number(f.unit_cost) || 0 : it.unit_cost
              return (
                <tbody key={it.id} className={`${tbodyClasses} border-t border-[var(--table-divider)]`}>
                  <tr>
                    <td className="p-2 pl-4 font-mono text-xs text-brand-600">{it.product_sku || it.sku}</td>
                    <td className="p-2 text-[var(--text-primary)]">{it.product_name}</td>
                    <td className="p-2 text-[var(--text-secondary)]">{translateColor(it.color)}/{it.size}</td>
                    <td className="p-2">
                      {f ? (
                        <input type="number" min={Math.max(it.received_qty || 0, 1)} value={f.qty}
                          onChange={(e) => setForm((s) => ({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, qty: e.target.value } : x)) }))}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                      ) : (
                        <>
                          <span className="font-semibold text-[var(--text-primary)]">{it.qty}</span>
                          {it.received_qty > 0 && <p className="text-[11px] text-green-600">{t('page_purchases.received_qty_label', { qty: it.received_qty })}</p>}
                          {open && it.received_qty > 0 && it.remaining > 0 && <p className="text-[11px] text-amber-600">{t('page_purchases.remaining_label', { qty: it.remaining })}</p>}
                        </>
                      )}
                    </td>
                    <td className="p-2">
                      {f ? (
                        <input type="number" min="0" value={f.unit_cost}
                          onChange={(e) => setForm((s) => ({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, unit_cost: e.target.value } : x)) }))}
                          className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                      ) : <span className="text-[var(--text-secondary)]">{formatCNY(it.unit_cost)}</span>}
                    </td>
                    <td className="p-2 pr-4 font-semibold text-[var(--text-primary)]">{formatCNY(qty * cost)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="p-0">
                      <ItemBatches item={it} canEdit={open && !editing} onChanged={reload} onError={setError} />
                    </td>
                  </tr>
                </tbody>
              )
            })}
          </table>
        </div>
      </div>

      {purchase.change_log?.length > 0 && (
        <details className={`${cardClasses} p-4`}>
          <summary className="text-xs font-semibold text-gray-500 cursor-pointer">{t('page_purchases.change_history_title')}</summary>
          <div className="mt-2 space-y-1">
            {purchase.change_log.map((c, i) => (
              <p key={i} className="text-xs text-gray-500">{c.field_name}: {c.old_value} → {c.new_value} ({c.changed_by}, {new Date(c.changed_at).toLocaleString()})</p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
