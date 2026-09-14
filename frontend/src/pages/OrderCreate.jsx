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
import CustomerPicker from '../components/CustomerPicker'
import ProductPickerModal from '../components/ProductPickerModal'

let blockKeySeq = 0
const emptyBlock = (defaultHostId = '') => ({
  key: ++blockKeySeq,
  hostId: defaultHostId,
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

function OrderBlock({ block, index, showRemove, hosts, pickupChains, liveSessions, shippingSettings, onUpdate, onRemove }) {
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedChain = pickupChains.find((c) => String(c.id) === String(block.pickupChainId))
  const isCvs = selectedChain?.chain_type === 'cvs_711' || selectedChain?.chain_type === 'cvs_familymart'
  const subtotal = block.items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const storeCodeValid = !isCvs || /^\d{6}$/.test(block.pickupStoreCode)

  useEffect(() => {
    if (block.shippingFeeDirty) return
    onUpdate('shippingFee', defaultShippingFee(selectedChain, shippingSettings, subtotal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChain?.id, shippingSettings, subtotal, block.shippingFeeDirty])

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
    const byVariant = new Map(block.items.map((it) => [it.variantId, it]))
    for (const it of newItems) byVariant.set(it.variantId, { hostId: block.hostId, ...it })
    onUpdate('items', [...byVariant.values()])
  }

  function removeItem(variantId) {
    onUpdate('items', block.items.filter((it) => it.variantId !== variantId))
  }

  // Default: every item in an order goes to the block's host. If products came from different
  // hosts, this lets each line item's host be overridden individually.
  function updateItem(variantId, field, value) {
    onUpdate('items', block.items.map((it) => (it.variantId === variantId ? { ...it, [field]: value } : it)))
  }

  const total = Math.max(0, subtotal - (Number(block.discountAmount) || 0) + (Number(block.additionalAmount) || 0) + (Number(block.shippingFee) || 0))

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">{t('page_order_create.order_block_title', { index: index + 1 })}</h2>
        {showRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">{t('page_order_create.remove_order_button')}</button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.host_label')}</label>
        <select value={block.hostId} onChange={(e) => onUpdate('hostId', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
          <option value="">{t('page_order_create.select_host_option')}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.live_session_label')}</label>
        <select value={block.liveSessionId} onChange={(e) => onUpdate('liveSessionId', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
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
                String(block.pickupChainId) === String(c.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
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
              value={block.pickupStoreCode}
              onChange={(e) => onUpdate('pickupStoreCode', e.target.value)}
              placeholder={t('page_order_create.store_code_placeholder')}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${storeCodeValid ? 'border-gray-300' : 'border-red-400'}`}
              required
            />
            {!storeCodeValid && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_format_error')}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_name_label')}</label>
            <input value={block.pickupStoreName} onChange={(e) => onUpdate('pickupStoreName', e.target.value)} placeholder={t('page_order_create.store_name_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_fee_label')}</label>
            <input type="number" min="0" value={block.shippingFee} onChange={(e) => { onUpdate('shippingFee', Number(e.target.value) || 0); onUpdate('shippingFeeDirty', true) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_address_label')}</label>
            <textarea value={block.shippingAddress} onChange={(e) => onUpdate('shippingAddress', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_fee_label')}</label>
            <input type="number" min="0" value={block.shippingFee} onChange={(e) => { onUpdate('shippingFee', Number(e.target.value) || 0); onUpdate('shippingFeeDirty', true) }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      ))}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">{t('page_order_create.section_products')}</label>
          <button type="button" onClick={() => setShowPicker(true)} className="text-sm font-semibold text-brand-600 hover:underline">
            {t('page_order_create.add_product_button')}
          </button>
        </div>
        {block.items.length === 0 ? (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">{t('page_order_create.no_products_yet')}</p>
        ) : (
          <div className="space-y-2">
            {block.items.map((it) => (
              <div key={it.variantId} className="flex items-center gap-3 border border-gray-200 rounded-lg p-2">
                <img src={resolveUrl(it.imageUrl)} className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.productName}</p>
                  <p className="text-xs text-gray-500">{it.variantLabel} · {t('page_order_create.qty_label')}: {it.qty}</p>
                </div>
                <select
                  value={it.hostId ?? block.hostId}
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
      </div>

      <div>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-gray-500 hover:underline">
          {showAdvanced ? t('page_order_create.hide_advanced') : t('page_order_create.show_advanced')}
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.discount_label')}</label>
              <input type="number" min="0" value={block.discountAmount} onChange={(e) => onUpdate('discountAmount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.additional_fee_label')}</label>
              <input type="number" min="0" value={block.additionalAmount} onChange={(e) => onUpdate('additionalAmount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.keep_date_label')}</label>
              <input type="date" value={block.keepDate} onChange={(e) => onUpdate('keepDate', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <p className="text-[10px] text-gray-400 mt-0.5">{t('page_order_create.keep_date_hint')}</p>
            </div>
          </div>
        )}
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
  const [blocks, setBlocks] = useState([emptyBlock()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    listHosts().then(setHosts)
    listPickupChains().then(setPickupChains)
    listLiveSessions({ status: 'live' }).then(setLiveSessions)
    getShippingSettings().then(setShippingSettings)
  }, [])

  function updateBlock(key, field, value) {
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, [field]: value } : b)))
  }

  function addBlock() {
    setBlocks((bs) => [...bs, emptyBlock(bs[bs.length - 1]?.hostId ?? '')])
  }

  function removeBlock(key) {
    setBlocks((bs) => bs.filter((b) => b.key !== key))
  }

  function validate() {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const chain = pickupChains.find((c) => String(c.id) === String(b.pickupChainId))
      const isCvs = chain?.chain_type === 'cvs_711' || chain?.chain_type === 'cvs_familymart'
      if (!b.hostId) return t('page_order_create.block_error_host', { index: i + 1 })
      if (!customerIsResolved(b.customer)) return t('page_order_create.block_error_customer', { index: i + 1 })
      if (!b.pickupChainId) return t('page_order_create.block_error_pickup_method', { index: i + 1 })
      if (isCvs && !/^\d{6}$/.test(b.pickupStoreCode)) return t('page_order_create.block_error_store_code', { index: i + 1 })
      if (!isCvs && !b.shippingAddress) return t('page_order_create.block_error_address', { index: i + 1 })
      if (b.items.length === 0) return t('page_order_create.block_error_no_products', { index: i + 1 })
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const settled = await Promise.allSettled(blocks.map((b) => createOrder({
        customer: b.customer.id ? { id: b.customer.id } : { name: b.customer.name, phone: b.customer.phone, address: b.customer.address },
        shipping_address: b.shippingAddress,
        pickup_chain_id: Number(b.pickupChainId),
        pickup_store_name: b.pickupStoreName,
        pickup_store_code: b.pickupStoreCode,
        items: b.items.map((it) => ({ host_id: Number(it.hostId ?? b.hostId), variant_id: it.variantId, qty: it.qty, live_session_id: b.liveSessionId ? Number(b.liveSessionId) : null })),
        discount_amount: Number(b.discountAmount) || 0,
        additional_amount: Number(b.additionalAmount) || 0,
        keep_date: b.keepDate || null,
        shipping_fee_override: Number(b.shippingFee) || 0,
      })))

      const succeeded = settled.filter((r) => r.status === 'fulfilled')
      const failed = settled.filter((r) => r.status === 'rejected')

      if (failed.length === 0 && succeeded.length === 1) {
        navigate(`/orders/${succeeded[0].value.order_id}`)
        return
      }
      setResult({
        orderNos: succeeded.map((r) => r.value.order_no),
        failCount: failed.length,
      })
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-3xl">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-2">{t('page_order_create.result_title')}</h2>
          {result.orderNos.length > 0 && (
            <p className="text-sm text-green-700 mb-2">{t('page_order_create.result_success', { count: result.orderNos.length, orderNos: result.orderNos.join(', ') })}</p>
          )}
          {result.failCount > 0 && (
            <p className="text-sm text-red-600 mb-2">{t('page_order_create.result_failed', { count: result.failCount })}</p>
          )}
          <button onClick={() => navigate('/orders')} className="mt-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg">
            {t('page_order_create.back_to_orders')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {blocks.map((block, index) => (
          <OrderBlock
            key={block.key}
            block={block}
            index={index}
            showRemove={blocks.length > 1}
            hosts={hosts}
            pickupChains={pickupChains}
            liveSessions={liveSessions}
            shippingSettings={shippingSettings}
            onUpdate={(field, value) => updateBlock(block.key, field, value)}
            onRemove={() => removeBlock(block.key)}
          />
        ))}

        <button type="button" onClick={addBlock} className="w-full border border-dashed border-gray-300 rounded-2xl py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50">
          {t('page_order_create.add_order_button')}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? t('page_order_create.saving') : t('page_order_create.submit_button')}
          </button>
          <button type="button" onClick={() => navigate('/orders')} className="text-gray-500 px-5 py-2.5">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
