import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getMergeGroup, updateMergeGroup } from '../api/orders'
import { listHosts } from '../api/hosts'
import { describeError } from '../utils/errorText'
import { formatCurrency } from '../utils/format'
import { useMasterData } from '../context/MasterDataContext'
import ProductPickerModal from './ProductPickerModal'
import { IconClose, IconTrash } from './icons'

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
const label = 'block text-sm font-medium text-gray-700 mb-1'

// Editor of a merged shipment (PUT /orders/merge-groups/{id}). The delivery data is shared by every order of the
// group; each item line is saved on its ORIGINAL order, so sales dates, Hosts and attribution never change. A new
// item is added to the chosen original order (default: the newer one).
export default function EditGroupModal({ groupId, onClose, onDone }) {
  const { t } = useTranslation()
  const { translateColor } = useMasterData()
  const [group, setGroup] = useState(null)
  const [hosts, setHosts] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeCode, setStoreCode] = useState('')
  const [address, setAddress] = useState('')
  const [fee, setFee] = useState(0)
  const [items, setItems] = useState([])
  const [extras, setExtras] = useState({})
  const [targetOrder, setTargetOrder] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listHosts(true).then(setHosts).catch(() => {})
    getMergeGroup(groupId).then((g) => {
      setGroup(g)
      setName(g.customer_name); setPhone(g.customer_phone); setEmail(g.customer_email || '')
      setStoreName(g.pickup_store_name || ''); setStoreCode(g.pickup_store_code || ''); setAddress(g.shipping_address || '')
      setFee(g.shipping_fee || 0)
      setItems(g.items.map((it) => ({
        id: it.id, orderId: it.order_id, variantId: it.variant_id, qty: it.qty, price: it.price, hostId: it.host_id || '',
        label: `${it.product_sku || it.sku} · ${it.product_name} (${translateColor(it.color)}/${it.size})`,
      })))
      setExtras(Object.fromEntries(g.members.map((m) => [m.id, { discount: m.discount_amount || 0, additional: m.additional_amount || 0 }])))
      setTargetOrder(String(g.members[g.members.length - 1].id)) // members come oldest first: default to the newer order
    }).catch((err) => setError(describeError(err, t('page_merge_edit.load_failed'))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const isCvs = group && (group.chain_type === 'cvs_711' || group.chain_type === 'cvs_familymart')
  const storeCodeValid = !isCvs || /^\d{6}$/.test(storeCode)
  const frozen = group ? group.members.some((m) => m.locked || m.status !== 'pending') : false
  const feeHolder = group?.members.find((m) => m.is_fee_holder)
  const defaultHost = items.find((it) => String(it.orderId) === targetOrder && it.hostId)?.hostId || ''

  function setItem(idx, patch) { setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it))) }

  function addProducts(picked) {
    const oid = Number(targetOrder)
    setItems((list) => {
      const next = [...list]
      for (const p of picked) {
        const same = next.find((it) => !it.id && it.orderId === oid && it.variantId === p.variantId)
        if (same) same.qty += p.qty
        else next.push({ id: null, orderId: oid, variantId: p.variantId, label: `${p.sku} · ${p.productName} (${p.variantLabel})`, qty: p.qty, price: p.price, hostId: defaultHost })
      }
      return next
    })
  }

  async function save() {
    setError('')
    if (!name.trim() || !phone.trim()) { setError(t('page_order_detail.edit_err_customer')); return }
    if (!storeCodeValid) return
    if (items.some((it) => !(Number(it.qty) > 0))) { setError(t('page_order_detail.edit_err_items')); return }
    setSaving(true)
    try {
      await updateMergeGroup(groupId, {
        customer: { name, phone, email },
        pickup_store_name: storeName,
        pickup_store_code: storeCode,
        shipping_address: isCvs ? '' : address,
        items: items.map((it) => ({
          ...(it.id ? { id: it.id } : { order_id: it.orderId }), variant_id: it.variantId, qty: Number(it.qty), price: Number(it.price) || 0, host_id: Number(it.hostId) || 0,
        })),
        members: group.members.map((m) => ({ order_id: m.id, discount_amount: Number(extras[m.id]?.discount) || 0, additional_amount: Number(extras[m.id]?.additional) || 0 })),
        ...(Number(fee) !== Number(group.shipping_fee || 0) ? { shipping_fee_override: Number(fee) || 0 } : {}),
      })
      onDone()
    } catch (err) {
      setError(describeError(err, t('page_order_detail.edit_failed')))
    } finally {
      setSaving(false)
    }
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg text-gray-800">{t('page_merge_edit.title', { id: groupId })}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('common.back')}><IconClose /></button>
        </div>
        {!group ? (
          <div className="p-8 text-center text-gray-400">{error || t('common.loading')}</div>
        ) : (
          <div className="p-5 space-y-5 overflow-y-auto">
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t('page_merge_edit.hint')}</p>
            {frozen && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t('page_order_detail.edit_after_ship_hint')}</p>}

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_customer_section')}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className={label}>{t('page_order_detail.edit_name')}</label><input value={name} onChange={(e) => setName(e.target.value)} className={field} /></div>
                <div><label className={label}>{t('page_order_detail.edit_phone')}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} /></div>
              </div>
              <div><label className={label}>{t('page_order_detail.edit_email')}</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_delivery_section')} · {group.pickup_chain_name}</h3>
              {isCvs ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>{t('page_order_create.store_code_label')}</label>
                    <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} className={`${field} ${storeCodeValid ? '' : 'border-red-400'}`} />
                    {!storeCodeValid && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_format_error')}</p>}
                  </div>
                  <div><label className={label}>{t('page_order_create.store_name_label')}</label><input value={storeName} onChange={(e) => setStoreName(e.target.value)} className={field} /></div>
                </div>
              ) : (
                <div><label className={label}>{t('page_order_create.shipping_address_label')}</label><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={field} /></div>
              )}
            </section>

            <fieldset disabled={frozen} className="contents">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-700">{t('page_order_detail.edit_items_section')}</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">{t('page_merge_edit.add_to_order')}</label>
                    <select value={targetOrder} onChange={(e) => setTargetOrder(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                      {group.members.map((m) => <option key={m.id} value={m.id}>{m.order_no}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowPicker(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">+ {t('page_order_detail.edit_add_item')}</button>
                  </div>
                </div>
                {group.members.map((m) => {
                  const rows = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.orderId === m.id)
                  return (
                    <div key={m.id} className="border border-gray-200 rounded-xl">
                      <div className="px-3 py-2 bg-gray-50 rounded-t-xl flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-gray-700">{m.order_no}</span>
                        <span className="text-gray-500">{new Date(m.created_at).toLocaleDateString('id-ID')} · {m.status}</span>
                      </div>
                      <div className="divide-y">
                        {rows.map(({ it, idx }) => (
                          <div key={it.id || `n${m.id}-${it.variantId}`} className="p-3 grid grid-cols-12 gap-2 items-center text-sm">
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
                            <button type="button" disabled={rows.length === 1} onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                              className="col-span-1 text-gray-400 hover:text-red-600 disabled:opacity-30" aria-label={t('page_order_detail.edit_remove_item')}><IconTrash /></button>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 grid grid-cols-2 gap-2 border-t border-gray-100">
                        <div><label className="text-[10px] text-gray-400">{t('page_order_detail.edit_discount')}</label>
                          <input type="number" min="0" value={extras[m.id]?.discount ?? 0} onChange={(e) => setExtras((x) => ({ ...x, [m.id]: { ...x[m.id], discount: e.target.value } }))} className={field} /></div>
                        <div><label className="text-[10px] text-gray-400">{t('page_order_detail.edit_additional')}</label>
                          <input type="number" min="0" value={extras[m.id]?.additional ?? 0} onChange={(e) => setExtras((x) => ({ ...x, [m.id]: { ...x[m.id], additional: e.target.value } }))} className={field} /></div>
                      </div>
                    </div>
                  )
                })}
                <div className="max-w-xs">
                  <label className={label}>{t('page_order_create.shipping_fee_label')}{feeHolder ? ` (${feeHolder.order_no})` : ''}</label>
                  <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className={field} />
                </div>
              </section>
            </fieldset>
            <p className="text-sm text-gray-500">{t('page_order_detail.edit_subtotal', { amount: formatCurrency(subtotal) })}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.back')}</button>
          <button onClick={save} disabled={saving || !group || !storeCodeValid} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {saving ? t('page_order_detail.saving_button') : t('common.save')}
          </button>
        </div>
      </div>
      {showPicker && <ProductPickerModal onClose={() => setShowPicker(false)} onAdd={addProducts} />}
    </div>
  )
}
