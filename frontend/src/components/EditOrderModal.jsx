import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateOrder } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listPickupChains } from '../api/pickupChains'
import { describeError } from '../utils/errorText'
import { formatCurrency } from '../utils/format'
import { useStoreCodeCheck } from '../utils/useStoreCodeCheck'
import { useMasterData } from '../context/MasterDataContext'
import ProductPickerModal from './ProductPickerModal'
import { IconClose, IconTrash } from './icons'

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
const label = 'block text-sm font-medium text-gray-700 mb-1'

// Edits every detail of an order that was NOT exported yet, in one save (PUT /orders/{id}). The server
// refuses (409) once the order is exported, merged lines/stock rules are enforced there too.
export default function EditOrderModal({ order, onClose, onDone }) {
  const { t } = useTranslation()
  const { translateColor } = useMasterData()
  const [pickupChains, setPickupChains] = useState([])
  const [hosts, setHosts] = useState([])
  const [name, setName] = useState(order.customer_name || '')
  const [phone, setPhone] = useState(order.customer_phone || '')
  const [email, setEmail] = useState(order.customer_email || '')
  const [chainId, setChainId] = useState(String(order.pickup_chain_id || ''))
  const [storeName, setStoreName] = useState(order.pickup_store_name || '')
  const [storeCode, setStoreCode] = useState(order.pickup_store_code || '')
  const [address, setAddress] = useState(order.shipping_address || '')
  const [items, setItems] = useState(() => order.items.map((it) => ({
    id: it.id, variantId: it.variant_id, label: `${it.product_sku || it.sku} · ${it.product_name} (${translateColor(it.color)}/${it.size})`,
    qty: it.qty, price: it.price, hostId: it.host_id || '', isNew: false,
  })))
  const [discount, setDiscount] = useState(order.discount_amount || 0)
  const [additional, setAdditional] = useState(order.additional_amount || 0)
  const [fee, setFee] = useState(order.shipping_fee || 0)
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listPickupChains(true).then(setPickupChains).catch(() => {})
    listHosts(true).then(setHosts).catch(() => {})
  }, [])

  const grouped = Boolean(order.shipment_group_id)
  const selectedChain = pickupChains.find((c) => String(c.id) === chainId)
  const isCvs = selectedChain?.chain_type === 'cvs_711' || selectedChain?.chain_type === 'cvs_familymart'
  const storeCodeValid = !isCvs || /^\d{6}$/.test(storeCode)
  const storeCodeCheck = useStoreCodeCheck(selectedChain?.chain_type, storeCode, isCvs)
  const defaultHost = items.find((it) => it.hostId)?.hostId || ''

  function setItem(idx, patch) { setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it))) }

  function addProducts(picked) {
    setItems((list) => {
      const next = [...list]
      for (const p of picked) {
        const same = next.find((it) => it.variantId === p.variantId)
        if (same) same.qty += p.qty
        else next.push({ id: null, variantId: p.variantId, label: `${p.sku} · ${p.productName} (${p.variantLabel})`, qty: p.qty, price: p.price, hostId: defaultHost, isNew: true })
      }
      return next
    })
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0)

  async function save() {
    setError('')
    if (!name.trim() || !phone.trim()) { setError(t('page_order_detail.edit_err_customer')); return }
    if (!chainId) { setError(t('page_order_create.block_error_pickup_method', { index: 1 })); return }
    if (!storeCodeValid) return
    if (items.length === 0 || items.some((it) => !(Number(it.qty) > 0))) { setError(t('page_order_detail.edit_err_items')); return }
    setSaving(true)
    try {
      await updateOrder(order.id, {
        customer: { name, phone, email },
        pickup_chain_id: Number(chainId),
        pickup_store_name: storeName,
        pickup_store_code: storeCode,
        shipping_address: isCvs ? '' : address,
        items: items.map((it) => ({
          ...(it.id ? { id: it.id } : {}), variant_id: it.variantId, qty: Number(it.qty), price: Number(it.price) || 0, host_id: Number(it.hostId) || 0,
        })),
        discount_amount: Number(discount) || 0,
        additional_amount: Number(additional) || 0,
        ...(Number(fee) !== Number(order.shipping_fee || 0) ? { shipping_fee_override: Number(fee) || 0 } : {}),
      })
      onDone()
    } catch (err) {
      setError(describeError(err, t('page_order_detail.edit_failed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg text-gray-800">{t('page_order_detail.edit_title', { orderNo: order.order_no })}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('common.back')}><IconClose /></button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto">
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t('page_order_detail.edit_hint')}</p>
          {grouped && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t('page_order_detail.edit_group_hint')}</p>}

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_customer_section')}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>{t('page_order_detail.edit_name')}</label><input value={name} onChange={(e) => setName(e.target.value)} disabled={grouped} className={field} /></div>
              <div><label className={label}>{t('page_order_detail.edit_phone')}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={grouped} className={field} /></div>
            </div>
            <div><label className={label}>{t('page_order_detail.edit_email')}</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_delivery_section')}</h3>
            <div className="flex flex-wrap gap-2">
              {pickupChains.map((c) => (
                <button key={c.id} type="button" disabled={grouped} onClick={() => setChainId(String(c.id))}
                  className={`text-sm font-semibold px-4 py-2 rounded-lg border disabled:opacity-50 ${chainId === String(c.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {c.name}
                </button>
              ))}
            </div>
            {selectedChain && (isCvs ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('page_order_create.store_code_label')}</label>
                  <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} disabled={grouped} className={`${field} ${storeCodeValid ? '' : 'border-red-400'}`} />
                  {!storeCodeValid && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_format_error')}</p>}
                  {storeCodeValid && storeCodeCheck?.exists === false && <p className="text-xs text-amber-600 mt-1">{t('page_order_create.store_code_not_found_error')}</p>}
                  {storeCodeValid && storeCodeCheck?.exists === true && <p className="text-xs text-green-600 mt-1">{storeCodeCheck.storeName}</p>}
                </div>
                <div><label className={label}>{t('page_order_create.store_name_label')}</label><input value={storeName} onChange={(e) => setStoreName(e.target.value)} disabled={grouped} className={field} /></div>
              </div>
            ) : (
              <div><label className={label}>{t('page_order_create.shipping_address_label')}</label><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} disabled={grouped} className={field} /></div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_items_section')}</h3>
              <button type="button" onClick={() => setShowPicker(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">+ {t('page_order_detail.edit_add_item')}</button>
            </div>
            <div className="divide-y border border-gray-200 rounded-xl">
              {items.map((it, idx) => (
                <div key={it.id || `n${it.variantId}`} className="p-3 grid grid-cols-12 gap-2 items-center text-sm">
                  <p className="col-span-12 sm:col-span-5 text-gray-800 break-words">{it.label}</p>
                  <div className="col-span-4 sm:col-span-2"><label className="text-[10px] text-gray-400">{t('page_order_detail.edit_qty')}</label>
                    <input type="number" min="1" value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} className={field} /></div>
                  <div className="col-span-4 sm:col-span-2"><label className="text-[10px] text-gray-400">{t('page_order_detail.edit_price')}</label>
                    <input type="number" min="0" value={it.price} onChange={(e) => setItem(idx, { price: e.target.value })} className={field} /></div>
                  <div className="col-span-3 sm:col-span-2"><label className="text-[10px] text-gray-400">Host</label>
                    <select value={it.hostId} onChange={(e) => setItem(idx, { hostId: e.target.value })} className={field}>
                      <option value="">-</option>
                      {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select></div>
                  <button type="button" disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                    className="col-span-1 text-gray-400 hover:text-red-600 disabled:opacity-30" aria-label={t('page_order_detail.edit_remove_item')}><IconTrash /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid sm:grid-cols-3 gap-3">
            <div><label className={label}>{t('page_order_detail.edit_discount')}</label><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={field} /></div>
            <div><label className={label}>{t('page_order_detail.edit_additional')}</label><input type="number" min="0" value={additional} onChange={(e) => setAdditional(e.target.value)} className={field} /></div>
            <div><label className={label}>{t('page_order_create.shipping_fee_label')}</label><input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className={field} /></div>
          </section>
          <p className="text-sm text-gray-500">{t('page_order_detail.edit_subtotal', { amount: formatCurrency(subtotal) })}</p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.back')}</button>
          <button onClick={save} disabled={saving || !storeCodeValid} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {saving ? t('page_order_detail.saving_button') : t('common.save')}
          </button>
        </div>
      </div>
      {showPicker && <ProductPickerModal onClose={() => setShowPicker(false)} onAdd={addProducts} />}
    </div>
  )
}
