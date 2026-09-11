import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPurchases, getPurchase, createPurchase, receivePurchase, deletePurchase } from '../api/purchases'
import { listSuppliers } from '../api/suppliers'
import { listProducts } from '../api/products'
import { formatCurrency } from '../utils/format'

const statusColors = { waiting: 'bg-yellow-100 text-yellow-700', received: 'bg-green-100 text-green-700' }

const emptyLine = () => ({ variantId: '', qty: 1, unitCost: '' })

function CreatePurchaseModal({ suppliers, products, onClose, onCreated }) {
  const { t } = useTranslation()
  const [supplierId, setSupplierId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ ...v, productName: p.name })))

  function updateLine(idx, field, value) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!supplierId || lines.some((l) => !l.variantId || !l.qty || l.unitCost === '')) {
      setError(t('page_purchases.error_incomplete_form'))
      return
    }
    setSaving(true)
    try {
      await createPurchase({
        supplier_id: Number(supplierId),
        order_date: orderDate,
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] text-gray-500">{t('page_purchases.label_products')}</label>
              <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-xs font-semibold text-brand-600 hover:underline">{t('page_purchases.add_line_button')}</button>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2 items-end border border-gray-200 rounded-lg p-2">
                <select value={l.variantId} onChange={(e) => updateLine(idx, 'variantId', e.target.value)} className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">{t('page_purchases.option_choose_variant')}</option>
                  {allVariants.map((v) => <option key={v.id} value={v.id}>{v.productName} - {v.color}/{v.size} ({v.sku})</option>)}
                </select>
                <input type="number" min="1" placeholder={t('page_purchases.placeholder_qty')} value={l.qty} onChange={(e) => updateLine(idx, 'qty', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <input type="number" min="0" placeholder={t('page_purchases.placeholder_unit_cost')} value={l.unitCost} onChange={(e) => updateLine(idx, 'unitCost', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
                )}
              </div>
            ))}
          </div>

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

  function reload() {
    getPurchase(purchaseId).then(setPurchase)
  }

  useEffect(reload, [purchaseId])

  async function handleReceive() {
    setBusy(true)
    try {
      await receivePurchase(purchaseId)
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
          <h2 className="font-bold text-gray-800">{t('page_purchases.detail_title', { id: purchase.id })}</h2>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[purchase.status]}`}>{t(`page_purchases.status_${purchase.status}`)}</span>
        </div>
        <p className="text-sm text-gray-500 mb-4">{purchase.supplier_name} · {purchase.order_date}</p>

        <div className="divide-y border border-gray-200 rounded-xl mb-4">
          {purchase.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium text-gray-800">{it.product_name}</p>
                <p className="text-xs text-gray-500">{it.color}/{it.size} · <span className="font-mono">{it.sku}</span></p>
              </div>
              <div className="text-right">
                <p className="text-gray-700">{it.qty} x {formatCurrency(it.unit_cost)}</p>
                <p className="text-xs text-gray-400">{formatCurrency(it.qty * it.unit_cost)}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-right text-sm font-bold text-gray-800 mb-4">{t('page_purchases.total_label', { amount: formatCurrency(totalCost) })}</p>

        {purchase.notes && <p className="text-sm text-gray-500 mb-4">{t('page_purchases.notes_label', { notes: purchase.notes })}</p>}

        <div className="flex gap-2">
          {purchase.status === 'waiting' && (
            <>
              <button onClick={handleReceive} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
                {t('page_purchases.confirm_received_button')}
              </button>
              <button onClick={handleDelete} disabled={busy} className="text-red-600 text-sm font-semibold px-5 py-2 hover:underline">
                {t('common.delete')}
              </button>
            </>
          )}
          <button onClick={onClose} className="ml-auto border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Purchases() {
  const { t } = useTranslation()
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  function reload() {
    listPurchases(statusFilter).then(setPurchases)
  }

  useEffect(reload, [statusFilter])
  useEffect(() => {
    listSuppliers(true).then(setSuppliers)
    listProducts().then(setProducts)
  }, [])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {['', 'waiting', 'received'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {s === '' ? t('page_purchases.filter_all') : t(`page_purchases.status_${s}`)}
            </button>
          ))}
        </div>
        <button onClick={() => setCreateOpen(true)} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {t('page_purchases.create_button')}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">{t('page_purchases.th_supplier')}</th>
              <th className="p-3">{t('page_purchases.th_date')}</th>
              <th className="p-3">{t('page_purchases.th_items')}</th>
              <th className="p-3">{t('page_purchases.th_total_cost')}</th>
              <th className="p-3">{t('page_purchases.th_status')}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchases.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailId(p.id)}>
                <td className="p-3 font-medium text-gray-800">{p.supplier_name}</td>
                <td className="p-3 text-gray-500">{p.order_date}</td>
                <td className="p-3 text-gray-600">{t('page_purchases.item_count_summary', { count: p.item_count, qty: p.total_qty })}</td>
                <td className="p-3 text-gray-700 font-semibold">{formatCurrency(p.total_cost)}</td>
                <td className="p-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status]}`}>{t(`page_purchases.status_${p.status}`)}</span>
                </td>
                <td className="p-3 text-brand-600 text-xs font-semibold">{t('page_purchases.detail_link')}</td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('page_purchases.empty_state')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreatePurchaseModal
          suppliers={suppliers}
          products={products}
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
