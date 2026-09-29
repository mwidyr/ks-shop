import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPurchaseRequisition, addRequisitionItem, removeRequisitionItem,
  updateRequisitionSupplierGroup, submitPurchaseRequisition,
} from '../api/purchaseRequisitions'
import { listProducts } from '../api/products'
import { listCategories } from '../api/categories'
import { getPurchase, updatePurchaseStatus, receivePurchase } from '../api/purchases'
import { productMatches } from '../components/ProductPickerModal'
import { resolveUrl } from '../utils/image'
import { formatCurrency } from '../utils/format'
import { IconChevronDown } from '../components/icons'

const statusColors = {
  pending_contact: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
}

const requisitionStatusColors = {
  draft: 'bg-yellow-100 text-yellow-700',
  submitted: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

const poStatuses = ['ordered', 'pending_arrival', 'cancelled']

// List-based picker (PDF point 01): search by name/SKU, filter by Category, browse products,
// expand one to Color/Size with Planned QTY inputs, add it immediately then keep browsing -
// unlike ProductPickerModal.jsx's single global "Save", each product card here commits itself
// right away so the user can move straight to the next product.
function RequisitionProductPicker({ requisitionId, onAdded }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [openId, setOpenId] = useState(null)
  const [qtyByProduct, setQtyByProduct] = useState({})
  const [addingId, setAddingId] = useState(null)
  const [warning, setWarning] = useState('')

  useEffect(() => {
    listProducts().then((data) => { setProducts(data.filter((p) => p.is_active)); setLoading(false) })
    listCategories().then((cats) => setCategories(cats.map((c) => c.name).sort()))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = products.filter((p) => {
    if (categoryFilter && p.category !== categoryFilter) return false
    if (q) return productMatches(p, q)
    return true
  })

  function setQty(productId, variantId, value) {
    setQtyByProduct((s) => ({ ...s, [productId]: { ...s[productId], [variantId]: value } }))
  }

  async function handleAdd(product) {
    const entries = Object.entries(qtyByProduct[product.id] || {}).filter(([, v]) => Number(v) > 0)
    if (entries.length === 0) return
    setAddingId(product.id)
    setWarning('')
    try {
      for (const [variantId, qty] of entries) {
        const res = await addRequisitionItem(requisitionId, { variant_id: Number(variantId), planned_qty: Number(qty) })
        if (res.rule_warning) setWarning(res.rule_warning)
      }
      setQtyByProduct((s) => ({ ...s, [product.id]: {} }))
      setOpenId(null)
      onAdded()
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="font-bold text-gray-800">{t('page_purchase_requisitions.pick_product_title')}</h2>
      <p className="text-xs text-gray-400">{t('page_purchase_requisitions.pick_product_hint')}</p>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('page_order_create.picker_search_placeholder')}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
          <option value="">{t('page_products.category_filter_all')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {warning && <p className="text-xs text-amber-600">{warning}</p>}

      <div className="max-h-[32rem] overflow-y-auto -mx-1 px-1">
        {loading ? (
          <p className="text-center text-gray-400 py-6 text-sm">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">{t('page_order_create.picker_empty')}</p>
        ) : (
          filtered.map((product) => {
            const isOpen = openId === product.id
            const qtyMap = qtyByProduct[product.id] || {}
            const selectedCount = Object.values(qtyMap).filter((v) => Number(v) > 0).length
            return (
              <div key={product.id} className="border border-gray-200 rounded-xl mb-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : product.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50"
                >
                  <img src={resolveUrl(product.images[0]?.url)} className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {product.sku && <p className="text-xs font-bold text-brand-600">{product.sku}</p>}
                    <p className="font-semibold text-gray-800 truncate text-sm">{product.name}</p>
                    {product.category && <p className="text-[11px] text-gray-400">{product.category}</p>}
                  </div>
                  {selectedCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 shrink-0">{selectedCount}</span>
                  )}
                  <IconChevronDown width={16} height={16} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100">
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 max-h-56 overflow-y-auto">
                      {product.variants.filter((v) => v.is_active !== false).map((v) => (
                        <div key={v.id} className="flex items-center gap-3 text-sm">
                          <span className="flex-1 text-gray-700">{v.color}/{v.size} · <span className="font-mono text-xs text-gray-400">{v.sku}</span></span>
                          <input
                            type="number" min="0" value={qtyMap[v.id] || ''}
                            onChange={(e) => setQty(product.id, v.id, e.target.value)}
                            placeholder="0"
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    {/* Static footer (not part of the scroll area above) so Add stays visible
                        for this product regardless of how many variants it has. */}
                    <div className="border-t border-gray-100 p-3">
                      <button
                        onClick={() => handleAdd(product)}
                        disabled={addingId === product.id || selectedCount === 0}
                        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
                      >
                        {addingId === product.id ? t('page_purchase_requisitions.adding') : t('page_purchase_requisitions.add_to_requisition')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Post-submission operations must stay in REQ Detail (PDF point 06): once a Supplier group has a
// linked Purchase Order, this renders the same status-change/receive UI Purchases.jsx's
// DetailModal has, inline in the card - reusing the existing purchases.go endpoints directly
// rather than duplicating that logic.
function SupplierPurchaseOrderPanel({ purchaseId, onChanged }) {
  const { t } = useTranslation()
  const [po, setPo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [receiveQty, setReceiveQty] = useState({})

  function reload() {
    getPurchase(purchaseId).then(setPo)
  }

  useEffect(reload, [purchaseId])

  if (!po) return <p className="text-xs text-gray-400">{t('common.loading')}</p>

  const editable = po.status === 'ordered' || po.status === 'pending_arrival'

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
    po.items.forEach((it) => { initial[it.id] = it.qty })
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

  return (
    <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gray-500">{po.po_number}</p>
        {editable ? (
          <select value={po.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={busy} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border-0 ${statusColors[po.status] || 'bg-yellow-100 text-yellow-700'}`}>
            {poStatuses.map((s) => <option key={s} value={s}>{t(`page_purchases.status_${s}`)}</option>)}
          </select>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t(`page_purchases.status_${po.status}`)}</span>
        )}
      </div>

      {receiving ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('page_purchases.receive_review_hint')}</p>
          {po.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2 text-sm">
              <div>
                <p className="font-medium text-gray-800">{it.product_name}</p>
                <p className="text-xs text-gray-500">{it.color}/{it.size} · {t('page_purchases.ordered_qty_label', { qty: it.qty })}</p>
              </div>
              <input type="number" min="0" value={receiveQty[it.id] ?? it.qty} onChange={(e) => setReceiveQty((r) => ({ ...r, [it.id]: e.target.value }))} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={confirmReceive} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {t('page_purchases.confirm_received_button')}
            </button>
            <button onClick={() => setReceiving(false)} className="text-gray-500 text-sm font-semibold px-4 py-1.5 hover:underline">{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y border border-gray-200 rounded-xl">
            {po.items.map((it) => (
              <div key={it.id} className="p-2 text-sm">
                <p className="font-medium text-gray-700">{it.product_name}</p>
                <p className="text-xs text-gray-500">{it.color}/{it.size} · {t('page_purchases.ordered_qty_label', { qty: it.qty })}</p>
                {it.received_qty != null && <p className="text-xs text-green-600">{t('page_purchases.received_qty_label', { qty: it.received_qty })}</p>}
              </div>
            ))}
          </div>
          {editable && (
            <button onClick={startReceive} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {t('page_purchases.receive_button')}
            </button>
          )}
        </>
      )}
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
    planned_qty: it.planned_qty, confirmed_qty: it.confirmed_qty ?? it.planned_qty, unit_cost: it.unit_cost ?? '',
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

  async function savePlannedQty(item) {
    const planned = Number(items[item.id]?.planned_qty)
    if (!planned || planned <= 0) return
    setSaving(true)
    try {
      await addRequisitionItem(group.requisition_id, { variant_id: item.variant_id, planned_qty: planned })
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
      <div className="divide-y border border-gray-200 rounded-xl">
        {group.items.map((it) => (
          <div key={it.id} className="p-2 text-sm">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="font-medium text-gray-700">{it.product_sku} · {it.product_name}</p>
                <p className="text-xs text-gray-400">{it.color}/{it.size}</p>
              </div>
              {editable && (
                <button onClick={() => removeItem(it.id)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              )}
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <label className="text-[11px] text-gray-400">{t('page_purchase_requisitions.planned_qty_placeholder')}</label>
                  <input
                    type="number" min="0"
                    value={items[it.id]?.planned_qty ?? ''}
                    onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], planned_qty: e.target.value } }))}
                    onBlur={() => savePlannedQty(it)}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                </div>
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
              <p className="text-xs text-gray-500">
                {t('page_purchase_requisitions.planned_qty_label', { qty: it.planned_qty })} · {t('page_purchase_requisitions.confirmed_qty_label', { qty: it.confirmed_qty ?? '-' })} · {formatCurrency(it.unit_cost || 0)}
              </p>
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

      {group.purchase_id && <SupplierPurchaseOrderPanel purchaseId={group.purchase_id} onChanged={onChanged} />}
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
  const isSubmitted = detail.status === 'submitted'
  const isCompleted = detail.status === 'completed'
  const allConfirmed = detail.suppliers.length > 0 && detail.suppliers.every((g) => g.status === 'confirmed')

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl space-y-4">
      <button onClick={() => navigate('/purchase-requisitions')} className="text-sm text-gray-500 hover:text-gray-800">
        ← {t('page_purchase_requisitions.back_button')}
      </button>

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">{detail.requisition_no}</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${requisitionStatusColors[detail.status]}`}>
          {t(`page_purchase_requisitions.status_${detail.status}`)}
        </span>
      </div>

      {isDraft && <RequisitionProductPicker requisitionId={detail.id} onAdded={reload} />}

      {(isSubmitted || isCompleted) && (
        <p className="text-xs text-gray-400">{t('page_purchase_requisitions.completes_hint')}</p>
      )}

      {detail.suppliers.map((g) => (
        <SupplierGroupCard key={g.id} group={{ ...g, requisition_id: detail.id }} editable={isDraft} onChanged={reload} />
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
