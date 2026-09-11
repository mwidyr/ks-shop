import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createOrder } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listPickupChains } from '../api/pickupChains'
import { listLiveSessions } from '../api/liveSessions'
import { listProducts } from '../api/products'
import { getShippingSettings } from '../api/settings'
import { formatCurrency } from '../utils/format'
import CustomerPicker from '../components/CustomerPicker'

const emptyLine = (defaultHostId = '') => ({ hostId: defaultHostId, productId: '', variantId: '', qty: 1 })

export default function OrderCreate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [hosts, setHosts] = useState([])
  const [pickupChains, setPickupChains] = useState([])
  const [products, setProducts] = useState([])
  const [lines, setLines] = useState([emptyLine()])
  const [customer, setCustomer] = useState(null)
  const [shippingAddress, setShippingAddress] = useState('')
  const [pickupChainId, setPickupChainId] = useState('')
  const [pickupStoreName, setPickupStoreName] = useState('')
  const [pickupStoreCode, setPickupStoreCode] = useState('')
  const [liveSessionId, setLiveSessionId] = useState('')
  const [liveSessions, setLiveSessions] = useState([])
  const [discountAmount, setDiscountAmount] = useState('')
  const [additionalAmount, setAdditionalAmount] = useState('')
  const [keepDate, setKeepDate] = useState('')
  const [freeShippingOverride, setFreeShippingOverride] = useState(false)
  const [shippingSettings, setShippingSettings] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listHosts().then(setHosts)
    listPickupChains().then(setPickupChains)
    listProducts().then(setProducts)
    listLiveSessions({ status: 'live' }).then(setLiveSessions)
    getShippingSettings().then(setShippingSettings)
  }, [])

  const selectedChain = pickupChains.find((c) => String(c.id) === String(pickupChainId))
  const needsStoreInfo = selectedChain && selectedChain.name !== 'Lainnya'

  function updateLine(idx, field, value) {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [field]: value }
      if (field === 'productId') next.variantId = ''
      return next
    }))
  }

  function addLine() {
    setLines((ls) => [...ls, emptyLine(ls[ls.length - 1]?.hostId ?? '')])
  }

  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx))
  }

  function variantsFor(productId) {
    const p = products.find((p) => String(p.id) === String(productId))
    return p ? p.variants : []
  }

  function variantCompareAtPrice(productId, variantId) {
    const v = variantsFor(productId).find((v) => String(v.id) === String(variantId))
    return v && v.compare_at_price > v.price ? v.compare_at_price : null
  }

  function variantPrice(productId, variantId) {
    const v = variantsFor(productId).find((v) => String(v.id) === String(variantId))
    return v ? v.price : 0
  }

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + variantPrice(l.productId, l.variantId) * (Number(l.qty) || 0), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, products])

  // Mirrors backend ComputeShippingFee (shipping_fee.go): 0 if overridden or subtotal clears
  // the relevant threshold, otherwise the chain's target_fee (minimarket) or the flat
  // home-delivery fee (Alamat Customer / Lainnya) - preview only, backend recomputes on submit.
  const shippingFee = useMemo(() => {
    if (freeShippingOverride || !selectedChain || !shippingSettings) return 0
    const isHomeDelivery = selectedChain.name === 'Alamat Customer' || selectedChain.name === 'Lainnya'
    if (isHomeDelivery) {
      const threshold = shippingSettings.free_shipping_threshold_pos
      if (threshold > 0 && subtotal >= threshold) return 0
      return shippingSettings.home_delivery_flat_fee
    }
    const threshold = shippingSettings.free_shipping_threshold_minimarket
    if (threshold > 0 && subtotal >= threshold) return 0
    return selectedChain.target_fee
  }, [freeShippingOverride, selectedChain, shippingSettings, subtotal])

  const total = Math.max(0, subtotal - (Number(discountAmount) || 0) + (Number(additionalAmount) || 0) + shippingFee)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!customer) {
      setError(t('page_order_create.select_customer_error'))
      return
    }
    if (!pickupChainId) {
      setError(t('page_order_create.select_pickup_method_error'))
      return
    }
    if (!shippingAddress) {
      setError(t('page_order_create.shipping_address_required_error'))
      return
    }
    const items = lines.map((l) => ({
      host_id: Number(l.hostId), variant_id: Number(l.variantId), qty: Number(l.qty),
      live_session_id: liveSessionId ? Number(liveSessionId) : null,
    }))
    if (items.some((it) => !it.host_id || !it.variant_id || !it.qty)) {
      setError(t('page_order_create.line_validation_error'))
      return
    }

    setSaving(true)
    try {
      const res = await createOrder({
        customer,
        shipping_address: shippingAddress,
        pickup_chain_id: Number(pickupChainId),
        pickup_store_name: pickupStoreName,
        pickup_store_code: pickupStoreCode,
        items,
        discount_amount: Number(discountAmount) || 0,
        additional_amount: Number(additionalAmount) || 0,
        keep_date: keepDate || null,
        free_shipping_override: freeShippingOverride,
      })
      navigate(`/orders/${res.order_id}`)
    } catch (err) {
      setError(err.response?.data?.error || t('page_order_create.create_order_failed_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">{t('page_order_create.section_customer')}</h2>
          <CustomerPicker onChange={setCustomer} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">{t('page_order_create.section_products_hosts')}</h2>
            <button type="button" onClick={addLine} className="text-sm font-semibold text-brand-600 hover:underline">
              {t('page_order_create.add_line')}
            </button>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.live_session_label')}</label>
            <select value={liveSessionId} onChange={(e) => setLiveSessionId(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">{t('page_order_create.no_session_option')}</option>
              {liveSessions.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.host_name})</option>)}
            </select>
          </div>
          <div className="space-y-3">
            {lines.map((l, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.host_label')}</label>
                  <select value={l.hostId} onChange={(e) => updateLine(idx, 'hostId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">{t('page_order_create.select_host_option')}</option>
                    {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.product_label')}</label>
                  <select value={l.productId} onChange={(e) => updateLine(idx, 'productId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">{t('page_order_create.select_product_option')}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.variant_label')}</label>
                  <select value={l.variantId} onChange={(e) => updateLine(idx, 'variantId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">{t('page_order_create.select_variant_option')}</option>
                    {variantsFor(l.productId).map((v) => (
                      <option key={v.id} value={v.id}>{t('page_order_create.variant_option', { sku: v.sku, color: v.color, size: v.size, stock: v.available_stock })}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_order_create.qty_label')}</label>
                  <input type="number" min="1" value={l.qty} onChange={(e) => updateLine(idx, 'qty', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    {variantCompareAtPrice(l.productId, l.variantId) && (
                      <span className="text-xs text-gray-400 line-through mr-1">{formatCurrency(variantCompareAtPrice(l.productId, l.variantId) * (Number(l.qty) || 0))}</span>
                    )}
                    {formatCurrency(variantPrice(l.productId, l.variantId) * (Number(l.qty) || 0))}
                  </span>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="text-xs text-red-600 hover:underline ml-2">{t('common.delete')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">{t('page_order_create.section_shipping_method')}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.pickup_method_label')}</label>
            <div className="flex flex-wrap gap-2">
              {pickupChains.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickupChainId(String(c.id))}
                  className={`text-sm font-semibold px-4 py-2 rounded-lg border ${
                    String(pickupChainId) === String(c.id)
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {needsStoreInfo && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_name_label')}</label>
                <input value={pickupStoreName} onChange={(e) => setPickupStoreName(e.target.value)} placeholder={t('page_order_create.store_name_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_code_label')}</label>
                <input value={pickupStoreCode} onChange={(e) => setPickupStoreCode(e.target.value)} placeholder={t('page_order_create.store_code_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_address_label')}</label>
            <textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.discount_label')}</label>
              <input type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.additional_fee_label')}</label>
              <input type="number" min="0" value={additionalAmount} onChange={(e) => setAdditionalAmount(e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.keep_date_label')}</label>
            <input type="date" value={keepDate} onChange={(e) => setKeepDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">{t('page_order_create.keep_date_hint')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={freeShippingOverride} onChange={(e) => setFreeShippingOverride(e.target.checked)} />
            {t('page_order_create.free_shipping_label')}
          </label>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>{t('page_order_create.subtotal_label')}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {Number(discountAmount) > 0 && (
              <div className="flex items-center justify-between text-red-600">
                <span>{t('page_order_create.discount_label')}</span>
                <span>-{formatCurrency(Number(discountAmount))}</span>
              </div>
            )}
            {Number(additionalAmount) > 0 && (
              <div className="flex items-center justify-between text-gray-500">
                <span>{t('page_order_create.additional_fee_label')}</span>
                <span>+{formatCurrency(Number(additionalAmount))}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-gray-500">
              <span>{t('page_order_create.shipping_fee_label')}</span>
              <span>{shippingFee > 0 ? `+${formatCurrency(shippingFee)}` : t('page_order_create.free_label')}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-gray-800">{t('page_order_create.total_label')}</span>
              <span className="text-xl font-extrabold text-brand-600">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

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
