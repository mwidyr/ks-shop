import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createOrder } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listPickupChains } from '../api/pickupChains'
import { listLiveSessions } from '../api/liveSessions'
import { getShippingSettings } from '../api/settings'
import { formatCurrency } from '../utils/format'
import { resolveUrl } from '../utils/image'
import CustomerPicker, { TW_PHONE_REGEX } from '../components/CustomerPicker'
import ProductPickerModal from '../components/ProductPickerModal'
import { useStoreCodeCheck } from '../utils/useStoreCodeCheck'

const emptyOrder = () => ({
  hostId: '',
  liveSessionId: '',
  customer: null,
  pickupChainId: '',
  pickupStoreName: '',
  pickupStoreCode: '',
  shippingAddress: '',
  shippingFee: 0,
  shippingFeeDirty: false,
  discountAmount: '',
  additionalAmount: '',
  keepDate: '',
  internalNotes: '',
  isUrgent: false,
  notesDeadline: '',
  items: [],
})

// Mirrors backend ComputeShippingFee (shipping_fee.go): the chain's target_fee (minimarket)
// or the flat home-delivery fee (chain_type='courier'), 0 once subtotal clears the relevant
// threshold. Used only to seed a sensible default into the now-editable Ongkos Kirim field.
function defaultShippingFee(chain, shippingSettings, subtotal) {
  if (!chain || !shippingSettings) return 0
  if (chain.chain_type === 'courier') {
    const threshold = shippingSettings.free_shipping_threshold_pos
    if (threshold > 0 && subtotal >= threshold) return 0
    return shippingSettings.home_delivery_flat_fee
  }
  const threshold = shippingSettings.free_shipping_threshold_minimarket
  if (threshold > 0 && subtotal >= threshold) return 0
  return chain.target_fee
}

function customerIsResolved(customer) {
  if (!customer) return false
  if (customer.id) return true
  return Boolean(customer.name && customer.phone)
}

function OrderForm({ order, hosts, pickupChains, liveSessions, shippingSettings, onUpdate }) {
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedChain = pickupChains.find((c) => String(c.id) === String(order.pickupChainId))
  const isCvs = selectedChain?.chain_type === 'cvs_711' || selectedChain?.chain_type === 'cvs_familymart'
  const subtotal = order.items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const storeCodeValid = !isCvs || /^\d{6}$/.test(order.pickupStoreCode)
  const storeCodeCheck = useStoreCodeCheck(selectedChain?.chain_type, order.pickupStoreCode, isCvs)
  // Mirrors defaultShippingFee's own threshold check - used only to show the "Gratis Ongkir"
  // hint, so it stays true only for threshold-driven free shipping, not a manual override to 0.
  const freeShippingEligible = Boolean(selectedChain && shippingSettings && (
    selectedChain.chain_type === 'courier'
      ? shippingSettings.free_shipping_threshold_pos > 0 && subtotal >= shippingSettings.free_shipping_threshold_pos
      : shippingSettings.free_shipping_threshold_minimarket > 0 && subtotal >= shippingSettings.free_shipping_threshold_minimarket
  ))
  const showFreeShippingHint = freeShippingEligible && !order.shippingFeeDirty

  useEffect(() => {
    if (storeCodeCheck?.exists) onUpdate('pickupStoreName', storeCodeCheck.storeName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCodeCheck])

  useEffect(() => {
    if (order.shippingFeeDirty) return
    onUpdate('shippingFee', defaultShippingFee(selectedChain, shippingSettings, subtotal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChain?.id, shippingSettings, subtotal, order.shippingFeeDirty])

  function handleCustomerChange(customer) {
    onUpdate('customer', customer)
    if (customer?.last_pickup_chain_id) {
      onUpdate('pickupChainId', String(customer.last_pickup_chain_id))
      onUpdate('pickupStoreName', customer.last_pickup_store_name || '')
      onUpdate('pickupStoreCode', customer.last_pickup_store_code || '')
      onUpdate('shippingFeeDirty', false)
    }
  }

  function handleAddItems(newItems) {
    const byVariant = new Map(order.items.map((it) => [it.variantId, it]))
    for (const it of newItems) byVariant.set(it.variantId, { hostId: order.hostId, ...it })
    onUpdate('items', [...byVariant.values()])
  }

  function removeItem(variantId) {
    onUpdate('items', order.items.filter((it) => it.variantId !== variantId))
  }

  // Default: every item in an order goes to the order's host. If products came from different
  // hosts, this lets each line item's host be overridden individually.
  function updateItem(variantId, field, value) {
    onUpdate('items', order.items.map((it) => (it.variantId === variantId ? { ...it, [field]: value } : it)))
  }

  const total = Math.max(0, subtotal - (Number(order.discountAmount) || 0) + (Number(order.additionalAmount) || 0) + (Number(order.shippingFee) || 0))

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <h2 className="font-bold text-gray-800">{t('page_order_create.order_block_title', { index: 1 })}</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.host_label')}</label>
        <select value={order.hostId} onChange={(e) => onUpdate('hostId', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
          <option value="">{t('page_order_create.select_host_option')}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.live_session_label')}</label>
        <select value={order.liveSessionId} onChange={(e) => onUpdate('liveSessionId', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">{t('page_order_create.no_session_option')}</option>
          {liveSessions.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.host_name})</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.section_customer')}</label>
        <CustomerPicker onChange={handleCustomerChange} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.pickup_method_label')}</label>
        <div className="flex flex-wrap gap-2">
          {pickupChains.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onUpdate('pickupChainId', String(c.id)); onUpdate('shippingFeeDirty', false) }}
              className={`text-sm font-semibold px-4 py-2 rounded-lg border ${
                String(order.pickupChainId) === String(c.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {selectedChain && (isCvs ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_code_label')}</label>
            <input
              value={order.pickupStoreCode}
              onChange={(e) => onUpdate('pickupStoreCode', e.target.value)}
              placeholder={t('page_order_create.store_code_placeholder')}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${storeCodeValid && storeCodeCheck?.exists !== false ? 'border-gray-300' : 'border-red-400'}`}
              required
            />
            {!storeCodeValid && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_format_error')}</p>}
            {storeCodeValid && storeCodeCheck?.exists === false && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_not_found_error')}</p>}
            {storeCodeValid && storeCodeCheck?.exists === true && <p className="text-xs text-green-600 mt-1">{storeCodeCheck.storeName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_name_label')}</label>
            <input value={order.pickupStoreName} onChange={(e) => onUpdate('pickupStoreName', e.target.value)} placeholder={t('page_order_create.store_name_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_fee_label')}</label>
            <input type="number" min="0" value={order.shippingFee} onChange={(e) => { onUpdate('shippingFee', Number(e.target.value) || 0); onUpdate('shippingFeeDirty', true) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            {showFreeShippingHint && <p className="text-xs text-green-600 mt-1">🎉 {t('page_order_create.free_shipping_hint')}</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_address_label')}</label>
            <textarea value={order.shippingAddress} onChange={(e) => onUpdate('shippingAddress', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_fee_label')}</label>
            <input type="number" min="0" value={order.shippingFee} onChange={(e) => { onUpdate('shippingFee', Number(e.target.value) || 0); onUpdate('shippingFeeDirty', true) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            {showFreeShippingHint && <p className="text-xs text-green-600 mt-1">🎉 {t('page_order_create.free_shipping_hint')}</p>}
          </div>
        </div>
      ))}

      <div>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-gray-500 hover:underline">
          {showAdvanced ? t('page_order_create.hide_advanced') : t('page_order_create.show_advanced')}
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.discount_label')}</label>
              <input type="number" min="0" value={order.discountAmount} onChange={(e) => onUpdate('discountAmount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.additional_fee_label')}</label>
              <input type="number" min="0" value={order.additionalAmount} onChange={(e) => onUpdate('additionalAmount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.keep_date_label')}</label>
              <input type="date" value={order.keepDate} onChange={(e) => onUpdate('keepDate', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <p className="text-[10px] text-gray-400 mt-0.5">{t('page_order_create.keep_date_hint')}</p>
            </div>
            <div className="col-span-2">
              <label className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 cursor-pointer bg-white">
                <span className="text-xs font-medium text-gray-700">{t('page_order_detail.mark_urgent_label')}</span>
                <input type="checkbox" checked={order.isUrgent} onChange={(e) => onUpdate('isUrgent', e.target.checked)} className="w-4 h-4" />
              </label>
            </div>
            {order.isUrgent && (
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_detail.deadline_label')}</label>
                <input
                  type="datetime-local"
                  value={order.notesDeadline}
                  onChange={(e) => onUpdate('notesDeadline', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_detail.internal_notes_label')}</label>
              <textarea
                value={order.internalNotes}
                onChange={(e) => onUpdate('internalNotes', e.target.value.slice(0, 2000))}
                rows={3}
                maxLength={2000}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm resize-y"
              />
              <p className="text-[10px] text-gray-400 text-right mt-0.5">{order.internalNotes.length} / 2000</p>
            </div>
          </div>
        )}
      </div>

      {/* Produk: moved to the bottom of the form, in the same full-width spot the old
          "+ Tambah Order" button used to occupy (now removed - this app only ever submits one
          order at a time), right above the Subtotal/Total footer. */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('page_order_create.section_products')}</label>
        {order.items.length === 0 ? (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center mb-2">{t('page_order_create.no_products_yet')}</p>
        ) : (
          <div className="space-y-2 mb-2">
            {order.items.map((it) => (
              <div key={it.variantId} className="flex items-center gap-3 border border-gray-200 rounded-lg p-2">
                <img src={resolveUrl(it.imageUrl)} className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.productName}</p>
                  <p className="text-xs text-gray-500">{it.sku && <span className="font-mono text-brand-600">{it.sku}</span>} · {it.variantLabel} · {t('page_order_create.qty_label')}: {it.qty}</p>
                </div>
                <select
                  value={it.hostId ?? order.hostId}
                  onChange={(e) => updateItem(it.variantId, 'hostId', e.target.value)}
                  title={t('page_order_create.host_label')}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 shrink-0"
                >
                  {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <span className="text-sm font-semibold text-gray-700 shrink-0">{formatCurrency(it.price * it.qty)}</span>
                <button type="button" onClick={() => removeItem(it.variantId)} className="text-xs text-red-600 hover:underline shrink-0">{t('common.delete')}</button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="w-full border border-dashed border-gray-300 rounded-2xl py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"
        >
          {t('page_order_create.add_product_button')}
        </button>
      </div>

      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between text-gray-500">
          <span>{t('page_order_create.subtotal_label')}</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-bold text-gray-800">{t('page_order_create.total_label')}</span>
          <span className="text-xl font-extrabold text-brand-600">{formatCurrency(total)}</span>
        </div>
      </div>

      {showPicker && <ProductPickerModal onClose={() => setShowPicker(false)} onAdd={handleAddItems} />}
    </div>
  )
}

export default function OrderCreate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [hosts, setHosts] = useState([])
  const [pickupChains, setPickupChains] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [shippingSettings, setShippingSettings] = useState(null)
  const [order, setOrder] = useState(emptyOrder())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listHosts().then(setHosts)
    listPickupChains().then(setPickupChains)
    listLiveSessions({ status: 'live' }).then(setLiveSessions)
    getShippingSettings().then(setShippingSettings)
  }, [])

  function updateOrder(field, value) {
    setOrder((o) => ({ ...o, [field]: value }))
  }

  function validate() {
    const isCvs = pickupChains.find((c) => String(c.id) === String(order.pickupChainId))?.chain_type
    const cvs = isCvs === 'cvs_711' || isCvs === 'cvs_familymart'
    if (!order.hostId) return t('page_order_create.block_error_host', { index: 1 })
    if (!customerIsResolved(order.customer)) return t('page_order_create.block_error_customer', { index: 1 })
    if (!order.customer.id && !TW_PHONE_REGEX.test(order.customer.phone || '')) return t('page_order_create.block_error_phone_format', { index: 1 })
    if (!order.pickupChainId) return t('page_order_create.block_error_pickup_method', { index: 1 })
    if (cvs && !/^\d{6}$/.test(order.pickupStoreCode)) return t('page_order_create.block_error_store_code', { index: 1 })
    if (!cvs && !order.shippingAddress) return t('page_order_create.block_error_address', { index: 1 })
    if (order.items.length === 0) return t('page_order_create.block_error_no_products', { index: 1 })
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const res = await createOrder({
        customer: order.customer.id ? { id: order.customer.id } : { name: order.customer.name, phone: order.customer.phone, address: order.customer.address },
        shipping_address: order.shippingAddress,
        pickup_chain_id: Number(order.pickupChainId),
        pickup_store_name: order.pickupStoreName,
        pickup_store_code: order.pickupStoreCode,
        items: order.items.map((it) => ({ host_id: Number(it.hostId ?? order.hostId), variant_id: it.variantId, qty: it.qty, live_session_id: order.liveSessionId ? Number(order.liveSessionId) : null })),
        discount_amount: Number(order.discountAmount) || 0,
        additional_amount: Number(order.additionalAmount) || 0,
        keep_date: order.keepDate || null,
        shipping_fee_override: Number(order.shippingFee) || 0,
        internal_notes: order.internalNotes,
        is_urgent: order.isUrgent,
        notes_deadline: order.isUrgent && order.notesDeadline ? new Date(order.notesDeadline).toISOString() : null,
      })
      navigate(`/orders/${res.order_id}`)
    } catch (err) {
      setError(err.response?.data?.error || t('page_order_create.result_failed', { count: 1 }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl pb-28">
      <form onSubmit={handleSubmit} className="space-y-6">
        <OrderForm
          order={order}
          hosts={hosts}
          pickupChains={pickupChains}
          liveSessions={liveSessions}
          shippingSettings={shippingSettings}
          onUpdate={updateOrder}
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex gap-3">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-8 py-4 text-lg rounded-lg disabled:opacity-60">
              {saving ? t('page_order_create.saving') : t('page_order_create.submit_button')}
            </button>
            <button type="button" onClick={() => navigate('/orders')} className="text-gray-500 px-5 py-4">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
