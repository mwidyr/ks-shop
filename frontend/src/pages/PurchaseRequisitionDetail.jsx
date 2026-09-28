import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPurchaseRequisition, addRequisitionItem, removeRequisitionItem,
  updateRequisitionSupplierGroup, submitPurchaseRequisition,
} from '../api/purchaseRequisitions'
import { listProducts } from '../api/products'
import { formatCurrency } from '../utils/format'
import ProductSearchBox from '../components/ProductSearchBox'

const statusColors = {
  pending_contact: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
}

function ProductPicker({ requisitionId, onAdded }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState({})
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { listProducts().then((data) => setProducts(data.filter((p) => p.is_active))) }, [])

  const product = products.find((p) => p.sku === sku)

  async function handleAdd() {
    if (!product) return
    setSaving(true)
    setWarning('')
    try {
      for (const v of product.variants) {
        const planned = Number(qty[v.id]) || 0
        if (planned <= 0) continue
        const res = await addRequisitionItem(requisitionId, { variant_id: v.id, planned_qty: planned })
        if (res.rule_warning) setWarning(res.rule_warning)
      }
      setSku(''); setQty({})
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="font-bold text-gray-800">{t('page_purchase_requisitions.pick_product_title')}</h2>
      <p className="text-xs text-gray-400">{t('page_purchase_requisitions.pick_product_hint')}</p>
      <ProductSearchBox products={products} sku={sku} onPick={setSku} />
      {product && (
        <div className="border border-gray-200 rounded-xl divide-y">
          {product.variants.map((v) => (
            <div key={v.id} className="flex items-center gap-3 p-2 text-sm">
              <span className="flex-1 text-gray-700">{v.color}/{v.size} · <span className="font-mono text-xs text-gray-400">{v.sku}</span></span>
              <input
                type="number" min="0" value={qty[v.id] || ''}
                onChange={(e) => setQty((q) => ({ ...q, [v.id]: e.target.value }))}
                placeholder="0"
                className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
              />
            </div>
          ))}
          <div className="p-2">
            <button onClick={handleAdd} disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {saving ? t('page_purchase_requisitions.adding') : t('page_purchase_requisitions.add_to_requisition')}
            </button>
          </div>
        </div>
      )}
      {warning && <p className="text-xs text-amber-600">{warning}</p>}
    </div>
  )
}

function SupplierGroupCard({ group, editable, onChanged }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => ({
    expected_ship_date: group.expected_ship_date || '',
    actual_ship_date: group.actual_ship_date || '',
    expected_arrival_date: group.expected_arrival_date || '',
    notes: group.notes || '',
  }))
  const [items, setItems] = useState(() => Object.fromEntries(group.items.map((it) => [it.id, {
    confirmed_qty: it.confirmed_qty ?? it.planned_qty, unit_cost: it.unit_cost ?? '',
  }])))
  const [saving, setSaving] = useState(false)

  function itemsPayload() {
    return Object.entries(items).map(([id, v]) => ({
      id: Number(id),
      confirmed_qty: v.confirmed_qty === '' ? null : Number(v.confirmed_qty),
      unit_cost: v.unit_cost === '' ? null : Number(v.unit_cost),
    }))
  }

  async function save(status) {
    setSaving(true)
    try {
      await updateRequisitionSupplierGroup(group.id, { ...form, items: itemsPayload(), ...(status ? { status } : {}) })
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(itemId) {
    await removeRequisitionItem(itemId)
    onChanged()
  }

  const total = group.items.reduce((sum, it) => {
    const v = items[it.id] || {}
    const q = Number(v.confirmed_qty ?? it.planned_qty) || 0
    const c = Number(v.unit_cost) || 0
    return sum + q * c
  }, 0)

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">{group.supplier_name}</h3>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[group.status]}`}>{t(`page_purchase_requisitions.group_status_${group.status}`)}</span>
      </div>
      {group.po_number && <p className="text-xs text-brand-600 font-mono">{group.po_number}</p>}

      <div className="divide-y border border-gray-200 rounded-xl">
        {group.items.map((it) => (
          <div key={it.id} className="p-2 text-sm">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="font-medium text-gray-700">{it.product_sku} · {it.product_name}</p>
                <p className="text-xs text-gray-400">{it.color}/{it.size} · {t('page_purchase_requisitions.planned_qty_label', { qty: it.planned_qty })}</p>
              </div>
              {editable && (
                <button onClick={() => removeItem(it.id)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              )}
            </div>
            {editable ? (
              <div className="flex gap-2">
                <input
                  type="number" min="0" placeholder={t('page_purchase_requisitions.confirmed_qty_placeholder')}
                  value={items[it.id]?.confirmed_qty ?? ''}
                  onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], confirmed_qty: e.target.value } }))}
                  className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
                <input
                  type="number" min="0" placeholder={t('page_purchase_requisitions.unit_cost_placeholder')}
                  value={items[it.id]?.unit_cost ?? ''}
                  onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], unit_cost: e.target.value } }))}
                  className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t('page_purchase_requisitions.confirmed_qty_label', { qty: it.confirmed_qty ?? '-' })} · {formatCurrency(it.unit_cost || 0)}</p>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchase_requisitions.expected_ship_date')}</label>
            <input type="date" value={form.expected_ship_date} onChange={(e) => setForm((f) => ({ ...f, expected_ship_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchase_requisitions.actual_ship_date')}</label>
            <input type="date" value={form.actual_ship_date} onChange={(e) => setForm((f) => ({ ...f, actual_ship_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchase_requisitions.expected_arrival_date')}</label>
            <input type="date" value={form.expected_arrival_date} onChange={(e) => setForm((f) => ({ ...f, expected_arrival_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchase_requisitions.group_notes')}</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          </div>
        </div>
      )}

      <p className="text-sm font-bold text-gray-800">{t('page_purchase_requisitions.group_subtotal', { amount: formatCurrency(total) })}</p>

      {editable && (
        <div className="flex gap-2">
          <button onClick={() => save(null)} disabled={saving} className="border border-gray-300 text-gray-600 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {t('common.save')}
          </button>
          {group.status === 'pending_contact' ? (
            <button onClick={() => save('confirmed')} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {t('page_purchase_requisitions.confirm_group')}
            </button>
          ) : (
            <button onClick={() => save('pending_contact')} disabled={saving} className="text-gray-500 text-sm font-semibold px-4 py-1.5 hover:underline">
              {t('page_purchase_requisitions.reopen_group')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PurchaseRequisitionDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    getPurchaseRequisition(id).then(setDetail)
  }

  useEffect(reload, [id])

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      await submitPurchaseRequisition(id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_purchase_requisitions.submit_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!detail) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  const isDraft = detail.status === 'draft'
  const allConfirmed = detail.suppliers.length > 0 && detail.suppliers.every((g) => g.status === 'confirmed')

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl space-y-4">
      <button onClick={() => navigate('/purchase-requisitions')} className="text-sm text-gray-500 hover:text-gray-800">
        ← {t('page_purchase_requisitions.back_button')}
      </button>

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">{detail.requisition_no}</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${detail.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          {t(`page_purchase_requisitions.status_${detail.status}`)}
        </span>
      </div>

      {isDraft && <ProductPicker requisitionId={detail.id} onAdded={reload} />}

      {detail.suppliers.map((g) => (
        <SupplierGroupCard key={g.id} group={g} editable={isDraft} onChanged={reload} />
      ))}

      {detail.suppliers.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">{t('page_purchase_requisitions.no_items_yet')}</p>
      )}

      {isDraft && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={handleSubmit} disabled={!allConfirmed || submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">
            {submitting ? t('page_purchase_requisitions.submitting') : t('page_purchase_requisitions.submit_button')}
          </button>
          {!allConfirmed && detail.suppliers.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">{t('page_purchase_requisitions.submit_hint')}</p>
          )}
        </div>
      )}
    </div>
  )
}
