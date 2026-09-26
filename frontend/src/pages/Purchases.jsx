import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  listPurchases, getPurchase, createPurchase, updatePurchase, updatePurchaseStatus,
  receivePurchase, deletePurchase,
} from '../api/purchases'
import { listSuppliers } from '../api/suppliers'
import { formatCurrency } from '../utils/format'
import ProductPickerModal from '../components/ProductPickerModal'

const statusColors = {
  ordered: 'bg-yellow-100 text-yellow-700',
  pending_arrival: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const statuses = ['ordered', 'pending_arrival', 'received', 'cancelled']

function CreatePurchaseModal({ suppliers, onClose, onCreated, initialSupplierId, initialLines }) {
  const { t } = useTranslation()
  const [supplierId, setSupplierId] = useState(() => initialSupplierId || '')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState(() => initialLines || [])
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateLine(variantId, field, value) {
    setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, [field]: value } : l)))
  }

  function removeLine(variantId) {
    setLines((ls) => ls.filter((l) => l.variantId !== variantId))
  }

  function handlePickerAdd(items) {
    setLines((ls) => {
      const byVariant = new Map(ls.map((l) => [l.variantId, l]))
      for (const it of items) {
        const existing = byVariant.get(it.variantId)
        byVariant.set(it.variantId, { ...it, unitCost: existing?.unitCost ?? '' })
      }
      return [...byVariant.values()]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!supplierId || lines.length === 0 || lines.some((l) => !l.qty || l.unitCost === '')) {
      setError(t('page_purchases.error_incomplete_form'))
      return
    }
    setSaving(true)
    try {
      await createPurchase({
        supplier_id: Number(supplierId),
        order_date: orderDate,
        expected_arrival_date: expectedArrivalDate,
        notes,
        items: lines.map((l) => ({ variant_id: Number(l.variantId), qty: Number(l.qty), unit_cost: Number(l.unitCost) })),
      })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || t('page_purchases.error_create_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800 mb-4">{t('page_purchases.modal_create_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_supplier')}</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                <option value="">{t('page_purchases.option_choose_supplier')}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_order_date')}</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_expected_arrival')}</label>
              <input type="date" value={expectedArrivalDate} onChange={(e) => setExpectedArrivalDate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] text-gray-500">{t('page_purchases.label_products')}</label>
              <button type="button" disabled={!supplierId} onClick={() => setShowPicker(true)} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40 disabled:no-underline">{t('page_purchases.add_line_button')}</button>
            </div>
            {lines.length === 0 && (
              <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3 text-center">{t('page_purchases.no_products_yet')}</p>
            )}
            {lines.map((l) => (
              <div key={l.variantId} className="grid grid-cols-6 gap-2 items-end border border-gray-200 rounded-lg p-2">
                <div className="col-span-3">
                  <p className="text-sm text-gray-700 truncate">{l.productName}</p>
                  <p className="text-xs text-gray-400">{l.sku && <span className="font-mono">{l.sku}</span>} · {l.variantLabel}</p>
                </div>
                <input type="number" min="1" placeholder={t('page_purchases.placeholder_qty')} value={l.qty} onChange={(e) => updateLine(l.variantId, 'qty', Number(e.target.value) || 1)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <input type="number" min="0" placeholder={t('page_purchases.placeholder_unit_cost')} value={l.unitCost} onChange={(e) => updateLine(l.variantId, 'unitCost', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <button type="button" onClick={() => removeLine(l.variantId)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            ))}
          </div>

          {showPicker && (
            <ProductPickerModal supplierId={supplierId} onClose={() => setShowPicker(false)} onAdd={handlePickerAdd} />
          )}

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="bg-gray-800 hover:bg-black disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
              {saving ? t('page_purchases.saving') : t('page_purchases.submit_create')}
            </button>
            <button type="button" onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DetailModal({ purchaseId, onClose, onChanged }) {
  const { t } = useTranslation()
  const [purchase, setPurchase] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [receiving, setReceiving] = useState(false)
  const [receiveQty, setReceiveQty] = useState({})

  function reload() {
    getPurchase(purchaseId).then(setPurchase)
  }

  useEffect(reload, [purchaseId])

  const editable = purchase && (purchase.status === 'ordered' || purchase.status === 'pending_arrival')

  function startEdit() {
    setEditForm({
      expected_arrival_date: purchase.expected_arrival_date || '',
      notes: purchase.notes || '',
      items: purchase.items.map((it) => ({ id: it.id, qty: it.qty, unit_cost: it.unit_cost })),
    })
    setEditing(true)
  }

  async function saveEdit() {
    setBusy(true)
    try {
      await updatePurchase(purchaseId, editForm)
      setEditing(false)
      reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusChange(status) {
    setBusy(true)
    try {
      await updatePurchaseStatus(purchaseId, status)
      reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  function startReceive() {
    const initial = {}
    purchase.items.forEach((it) => { initial[it.id] = it.qty })
    setReceiveQty(initial)
    setReceiving(true)
  }

  async function confirmReceive() {
    setBusy(true)
    try {
      await receivePurchase(purchaseId, Object.entries(receiveQty).map(([id, qty]) => ({ id: Number(id), received_qty: Number(qty) })))
      setReceiving(false)
      reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deletePurchase(purchaseId)
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!purchase) return null

  const totalCost = purchase.items.reduce((s, it) => s + it.qty * it.unit_cost, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-800">{purchase.po_number}</h2>
          {editable ? (
            <select value={purchase.status} onChange={(e) => handleStatusChange(e.target.value)} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border-0 ${statusColors[purchase.status]}`}>
              <option value="ordered">{t('page_purchases.status_ordered')}</option>
              <option value="pending_arrival">{t('page_purchases.status_pending_arrival')}</option>
              <option value="cancelled">{t('page_purchases.status_cancelled')}</option>
            </select>
          ) : (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[purchase.status]}`}>{t(`page_purchases.status_${purchase.status}`)}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-1">{purchase.supplier_name} · {purchase.order_date}</p>
        {purchase.expected_arrival_date && <p className="text-xs text-gray-400 mb-4">{t('page_purchases.expected_arrival_label', { date: purchase.expected_arrival_date })}</p>}

        {receiving ? (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-gray-500">{t('page_purchases.receive_review_hint')}</p>
            {purchase.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{it.product_name}</p>
                  <p className="text-xs text-gray-500">{it.color}/{it.size} · {t('page_purchases.ordered_qty_label', { qty: it.qty })}</p>
                </div>
                <input type="number" min="0" value={receiveQty[it.id] ?? it.qty} onChange={(e) => setReceiveQty((r) => ({ ...r, [it.id]: e.target.value }))} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y border border-gray-200 rounded-xl mb-4">
            {purchase.items.map((it) => (
              <div key={it.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{it.product_name}</p>
                    <p className="text-xs text-gray-500">{it.color}/{it.size} · <span className="font-mono">{it.sku}</span></p>
                  </div>
                  {editing ? (
                    <div className="flex gap-1">
                      <input type="number" min="1" value={editForm.items.find((x) => x.id === it.id).qty}
                        onChange={(e) => setEditForm((f) => ({ ...f, items: f.items.map((x) => (x.id === it.id ? { ...x, qty: Number(e.target.value) } : x)) }))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                      <input type="number" min="0" value={editForm.items.find((x) => x.id === it.id).unit_cost}
                        onChange={(e) => setEditForm((f) => ({ ...f, items: f.items.map((x) => (x.id === it.id ? { ...x, unit_cost: Number(e.target.value) } : x)) }))}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-gray-700">{it.qty} x {formatCurrency(it.unit_cost)}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(it.qty * it.unit_cost)}</p>
                    </div>
                  )}
                </div>
                {it.received_qty != null && <p className="text-xs text-green-600 mt-1">{t('page_purchases.received_qty_label', { qty: it.received_qty })}</p>}
              </div>
            ))}
          </div>
        )}
        {!receiving && <p className="text-right text-sm font-bold text-gray-800 mb-4">{t('page_purchases.total_label', { amount: formatCurrency(totalCost) })}</p>}

        {editing ? (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_expected_arrival')}</label>
              <input type="date" value={editForm.expected_arrival_date} onChange={(e) => setEditForm((f) => ({ ...f, expected_arrival_date: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchases.label_notes')}</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
            </div>
          </div>
        ) : purchase.notes && <p className="text-sm text-gray-500 mb-4">{t('page_purchases.notes_label', { notes: purchase.notes })}</p>}

        {purchase.change_log?.length > 0 && !editing && !receiving && (
          <details className="mb-4">
            <summary className="text-xs font-semibold text-gray-500 cursor-pointer">{t('page_purchases.change_history_title')}</summary>
            <div className="mt-2 space-y-1">
              {purchase.change_log.map((c, i) => (
                <p key={i} className="text-xs text-gray-500">
                  {c.field_name}: {c.old_value} → {c.new_value} ({c.changed_by}, {new Date(c.changed_at).toLocaleString()})
                </p>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap gap-2">
          {receiving ? (
            <>
              <button onClick={confirmReceive} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
                {t('page_purchases.confirm_received_button')}
              </button>
              <button onClick={() => setReceiving(false)} className="text-gray-500 text-sm font-semibold px-5 py-2 hover:underline">{t('common.cancel')}</button>
            </>
          ) : editing ? (
            <>
              <button onClick={saveEdit} disabled={busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
                {t('common.save')}
              </button>
              <button onClick={() => setEditing(false)} className="text-gray-500 text-sm font-semibold px-5 py-2 hover:underline">{t('common.cancel')}</button>
            </>
          ) : editable ? (
            <>
              <button onClick={startReceive} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
                {t('page_purchases.receive_button')}
              </button>
              <button onClick={startEdit} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.edit')}</button>
              <button onClick={handleDelete} disabled={busy} className="text-red-600 text-sm font-semibold px-5 py-2 hover:underline">{t('common.delete')}</button>
            </>
          ) : null}
          <button onClick={onClose} className="ml-auto border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Purchases() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  // Arrived here from Replenishment Planning's "Buat Pembelian dari Rencana" - captured once on
  // mount (not re-derived from location.state) so clearing the nav state below can't race it out
  // from under the modal before it renders.
  const [pendingPrefill] = useState(() => location.state?.prefillPurchase || null)
  const [createOpen, setCreateOpen] = useState(() => Boolean(pendingPrefill))
  const [detailId, setDetailId] = useState(null)

  function reload() {
    listPurchases(statusFilter).then(setPurchases)
  }

  useEffect(() => {
    if (pendingPrefill) navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(reload, [statusFilter])
  useEffect(() => { listSuppliers(true).then(setSuppliers) }, [])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {['', ...statuses].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {s === '' ? t('page_purchases.filter_all') : t(`page_purchases.status_${s}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Link to="/purchases/history" className="border border-gray-300 text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50">
            {t('page_purchases.history_link')}
          </Link>
          <button onClick={() => setCreateOpen(true)} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {t('page_purchases.create_button')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">{t('page_purchases.th_po_number')}</th>
              <th className="p-3">{t('page_purchases.th_supplier')}</th>
              <th className="p-3">{t('page_purchases.th_date')}</th>
              <th className="p-3">{t('page_purchases.th_expected_arrival')}</th>
              <th className="p-3">{t('page_purchases.th_items')}</th>
              <th className="p-3">{t('page_purchases.th_total_cost')}</th>
              <th className="p-3">{t('page_purchases.th_status')}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchases.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailId(p.id)}>
                <td className="p-3 font-mono text-xs text-brand-600">{p.po_number}</td>
                <td className="p-3 font-medium text-gray-800">{p.supplier_name}</td>
                <td className="p-3 text-gray-500">{p.order_date}</td>
                <td className="p-3 text-gray-500">{p.expected_arrival_date || '-'}</td>
                <td className="p-3 text-gray-600">{t('page_purchases.item_count_summary', { count: p.item_count, qty: p.total_qty })}</td>
                <td className="p-3 text-gray-700 font-semibold">{formatCurrency(p.total_cost)}</td>
                <td className="p-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status]}`}>{t(`page_purchases.status_${p.status}`)}</span>
                </td>
                <td className="p-3 text-brand-600 text-xs font-semibold">{t('page_purchases.detail_link')}</td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">{t('page_purchases.empty_state')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreatePurchaseModal
          suppliers={suppliers}
          initialSupplierId={pendingPrefill?.supplierId}
          initialLines={pendingPrefill?.lines}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload() }}
        />
      )}
      {detailId && (
        <DetailModal purchaseId={detailId} onClose={() => setDetailId(null)} onChanged={reload} />
      )}
    </div>
  )
}
