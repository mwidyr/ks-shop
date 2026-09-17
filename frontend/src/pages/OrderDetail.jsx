import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  addOrderAttachment, deleteMergeGroup, getOrder, pickOrderItem, splitOrder, updateOrderKeepDate, updateOrderNotes, updateOrderPickup, updateOrderStatus,
} from '../api/orders'
import { listPickupChains } from '../api/pickupChains'
import { formatCurrency } from '../utils/format'
import { resolveUrl, uploadImageFile } from '../utils/image'
import { useStoreCodeCheck } from '../utils/useStoreCodeCheck'
import StatusPill, { statusLabels } from '../components/StatusPill'
import PickingLineItem from '../components/PickingLineItem'
import ScanVerifyModal from '../components/ScanVerifyModal'
import { IconClose } from '../components/icons'

function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const transitions = {
  pending: ['picking', 'cancelled'],
  picking: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled', 'return'],
  delivered: ['return'],
}

const todoByStatus = {
  pending: ['todo_waiting_picking'],
  picking: ['todo_picking_in_progress'],
  ready_to_ship: ['todo_pickup_done', 'todo_waiting_shipment'],
  shipped: ['todo_in_transit'],
  delivered: ['todo_order_done'],
  cancelled: ['todo_order_cancelled'],
  return: ['todo_order_returned'],
}

function SplitOrderModal({ order, onClose, onDone }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSplit() {
    if (selected.size === 0 || selected.size >= order.items.length) {
      setError(t('page_order_detail.split_partial_selection_error'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await splitOrder(order.id, [...selected])
      onDone(res.new_order_id)
    } catch (err) {
      setError(err.response?.data?.error || t('page_order_detail.split_failed_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">{t('page_order_detail.split_order_action')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t('page_order_detail.split_modal_hint')}</p>
        <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
          {order.items.map((it) => (
            <label key={it.id} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 text-sm">
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
              <span className="flex-1">{it.product_name} ({it.color}/{it.size}) × {it.qty}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button onClick={handleSplit} disabled={saving} className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
          {saving ? t('page_order_detail.processing') : t('page_order_detail.split_order_action')}
        </button>
      </div>
    </div>
  )
}

function NotesModal({ order, onClose, onDone }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(order.internal_notes || '')
  const [isUrgent, setIsUrgent] = useState(order.is_urgent || false)
  const [deadline, setDeadline] = useState(isoToLocalInput(order.notes_deadline))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await updateOrderNotes(order.id, {
        internal_notes: notes,
        is_urgent: isUrgent,
        notes_deadline: isUrgent && deadline ? new Date(deadline).toISOString() : null,
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-lg text-gray-800 mb-1">{t('page_order_detail.notes_modal_title')}</h2>
          <p className="text-xs text-gray-500">{t('page_order_detail.notes_modal_hint', { orderNo: order.order_no })}</p>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">{t('page_order_detail.mark_urgent_label')}</span>
            <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} className="w-4 h-4" />
          </label>
          {isUrgent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_detail.deadline_label')}</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_detail.internal_notes_label')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              rows={4}
              maxLength={2000}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{notes.length} / 2000</p>
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">
            {t('common.back')}
          </button>
          <button onClick={handleSave} disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {saving ? t('page_order_detail.saving_button') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PickupMethodModal({ order, pickupChains, onClose, onDone }) {
  const { t } = useTranslation()
  const [chainId, setChainId] = useState(String(order.pickup_chain_id || ''))
  const [storeName, setStoreName] = useState(order.pickup_store_name || '')
  const [storeCode, setStoreCode] = useState(order.pickup_store_code || '')
  const [address, setAddress] = useState(order.shipping_address || '')
  const [fee, setFee] = useState(order.shipping_fee || 0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedChain = pickupChains.find((c) => String(c.id) === chainId)
  const isCvs = selectedChain?.chain_type === 'cvs_711' || selectedChain?.chain_type === 'cvs_familymart'
  const storeCodeValid = !isCvs || /^\d{6}$/.test(storeCode)
  const storeCodeCheck = useStoreCodeCheck(selectedChain?.chain_type, storeCode, isCvs)

  useEffect(() => {
    if (storeCodeCheck?.exists) setStoreName(storeCodeCheck.storeName)
  }, [storeCodeCheck])

  async function handleSave() {
    setError('')
    if (!chainId) {
      setError(t('page_order_create.block_error_pickup_method', { index: 1 }))
      return
    }
    if (!storeCodeValid) return
    setSaving(true)
    try {
      await updateOrderPickup(order.id, {
        pickup_chain_id: Number(chainId),
        pickup_store_name: storeName,
        pickup_store_code: storeCode,
        shipping_address: isCvs ? '' : address,
        shipping_fee_override: Number(fee) || 0,
      })
      onDone()
    } catch (err) {
      setError(err.response?.data?.error || t('page_order_detail.update_status_failed_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">{t('page_order_detail.pickup_modal_title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.pickup_method_label')}</label>
            <div className="flex flex-wrap gap-2">
              {pickupChains.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChainId(String(c.id))}
                  className={`text-sm font-semibold px-4 py-2 rounded-lg border ${
                    chainId === String(c.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {selectedChain && (isCvs ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_code_label')}</label>
                <input
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  placeholder={t('page_order_create.store_code_placeholder')}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${storeCodeValid && storeCodeCheck?.exists !== false ? 'border-gray-300' : 'border-red-400'}`}
                />
                {!storeCodeValid && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_format_error')}</p>}
                {storeCodeValid && storeCodeCheck?.exists === false && <p className="text-xs text-red-600 mt-1">{t('page_order_create.store_code_not_found_error')}</p>}
                {storeCodeValid && storeCodeCheck?.exists === true && <p className="text-xs text-green-600 mt-1">{storeCodeCheck.storeName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.store_name_label')}</label>
                <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t('page_order_create.store_name_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_address_label')}</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}

          {selectedChain && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_order_create.shipping_fee_label')}</label>
              <input type="number" min="0" value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">
            {t('common.back')}
          </button>
          <button onClick={handleSave} disabled={saving || !storeCodeValid} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {saving ? t('page_order_detail.saving_button') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [error, setError] = useState('')
  const [keepDateDraft, setKeepDateDraft] = useState('')
  const [keepDateSaving, setKeepDateSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [pickupModalOpen, setPickupModalOpen] = useState(false)
  const [pickupChains, setPickupChains] = useState([])

  function load() {
    getOrder(id).then((o) => { setOrder(o); setKeepDateDraft(o.keep_date || '') })
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { listPickupChains().then(setPickupChains) }, [])

  async function handleUpdateStatus(status) {
    setError('')
    if ((status === 'cancelled' || status === 'return') && !reason) {
      setPendingAction(status)
      return
    }
    if (status === 'picking' && !order.items.some((it) => it.picked_qty > 0)) {
      setError(t('page_order_detail.start_picking_no_items_error'))
      return
    }
    try {
      await updateOrderStatus(id, status, reason)
      setReason('')
      setPendingAction(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || t('page_order_detail.update_status_failed_error'))
    }
  }

  async function handlePick(itemId, pickedQty) {
    await pickOrderItem(itemId, pickedQty)
    load()
  }

  async function handleScanMatch(code) {
    const item = order.items.find((it) => it.sku === code && it.picked_qty < it.qty)
    if (item) await handlePick(item.id, item.picked_qty + 1)
  }

  async function handleUnmerge() {
    if (!order.shipment_group_id) return
    await deleteMergeGroup(order.shipment_group_id)
    load()
  }

  async function saveKeepDate(value) {
    setKeepDateSaving(true)
    try {
      await updateOrderKeepDate(id, value || null)
      load()
    } finally {
      setKeepDateSaving(false)
    }
  }

  async function handleUploadAttachment(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImageFile(file)
      await addOrderAttachment(id, url)
      load()
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (!order) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('common.loading')}</div>

  const nextOptions = transitions[order.status] || []
  function actionLabel(s) {
    if (order.status === 'pending') {
      if (s === 'picking') return t('page_order_detail.start_picking_action')
      if (s === 'cancelled') return t('page_order_detail.reject_order_action')
    }
    return t(`status.${s}`, statusLabels[s])
  }

  const hostNames = [...new Set(order.items.map((it) => it.host_name).filter((n) => n && n !== '-'))]
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0)
  const totalPicked = order.items.reduce((s, it) => s + it.picked_qty, 0)
  const progres = totalPicked === 0
    ? t('page_order_detail.progress_waiting')
    : totalPicked < totalQty
    ? t('page_order_detail.progress_partial', { picked: totalPicked, total: totalQty })
    : t('page_order_detail.progress_done')

  async function copyOrderInfo() {
    const isGrouped = order.shipment_group_id && order.shipment_group_items?.length > 0
    const orderNos = order.shipment_group_id ? [order.order_no, ...order.shipment_group_order_nos] : [order.order_no]
    const pickupInfo = `${order.pickup_chain_name}${order.pickup_store_name ? ' - ' + order.pickup_store_name : ''}${order.pickup_store_code ? ' #' + order.pickup_store_code : ''}`
    // When merged, the fee/total/items must reflect the whole group (one shipping charge,
    // every product across all merged orders) - never just this order's own slice of it.
    const items = isGrouped ? order.shipment_group_items : order.items
    const total = isGrouped ? order.shipment_group_total : order.total
    const shippingFee = isGrouped ? order.shipment_group_shipping_fee : order.shipping_fee
    const shippingInfo = shippingFee > 0
      ? formatCurrency(shippingFee)
      : t('page_order_detail.free_label') + (order.shipment_group_id ? t('page_order_detail.copy_combined_shipment_note') : '')
    const lines = [
      t('page_order_detail.copy_order_label', { orderNos: orderNos.join(' + ') }),
      t('page_order_detail.copy_customer_label', { name: order.customer_name, phone: order.customer_phone }),
      t('page_order_detail.copy_address_label', { address: order.shipping_address }),
      t('page_order_detail.copy_pickup_label', { pickup: pickupInfo }),
      '',
      t('page_order_detail.copy_products_header'),
      ...items.map((it) => t('page_order_detail.copy_item_line', { name: it.product_name, variant: `${it.color}/${it.size}`, qty: it.qty, subtotal: formatCurrency(it.price * it.qty) })),
      '',
      t('page_order_detail.copy_shipping_label', { fee: shippingInfo }),
      t('page_order_detail.copy_total_label', { total: formatCurrency(total) }),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard access denied - nothing more we can do here
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-800 flex items-center gap-2">
          {order.order_no}
          {order.is_urgent && (
            <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              {t('page_order_detail.urgent_badge')}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={copyOrderInfo} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
            {copied ? t('page_order_detail.copied_label') : t('page_order_detail.copy_info_button')}
          </button>
          <StatusPill status={order.status} />
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">{order.customer_name} · {order.customer_phone}</p>

      {order.customer_blacklisted && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">
          {t('page_order_detail.blacklist_warning')}
        </div>
      )}

      {order.shipment_group_id && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <span>{t('page_order_detail.shipment_group_banner', { groupId: order.shipment_group_id, orderNos: order.shipment_group_order_nos.join(', ') })}</span>
          <button onClick={handleUnmerge} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 hover:bg-amber-100">
            {t('page_order_detail.unmerge_button')}
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] uppercase text-gray-400 mb-0.5">{t('page_order_detail.stage_label')}</p>
              <StatusPill status={order.status} />
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-400 mb-0.5">{t('page_order_detail.fulfillment_progress_label')}</p>
              <p className="font-semibold text-gray-700">{progres}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">{t('page_order_detail.customer_contact_label')}</p>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{order.customer_name}</p>
              <a href={`tel:${order.customer_phone}`} className="text-sm text-brand-600 font-medium hover:underline">☎ {order.customer_phone}</a>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-gray-700">{t('page_order_detail.keep_order_label')}</p>
              {keepDateDraft && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                  {t('page_order_detail.keep_order_held_until', { date: keepDateDraft })}
                </span>
              )}
            </div>
            <input
              type="date"
              value={keepDateDraft}
              onChange={(e) => setKeepDateDraft(e.target.value)}
              onBlur={(e) => saveKeepDate(e.target.value)}
              disabled={keepDateSaving}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
            {keepDateDraft && (
              <button
                onClick={() => { setKeepDateDraft(''); saveKeepDate('') }}
                className="ml-2 text-xs text-gray-500 hover:text-red-600"
              >
                {t('common.delete')}
              </button>
            )}
            <p className="text-xs text-gray-400 mt-1">{t('page_order_detail.keep_order_hint')}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm divide-y">
            <div className="p-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{t('page_order_detail.product_details_label', { count: order.items.length })}</p>
              <div className="flex gap-2">
                <button onClick={() => setScanOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                  {t('page_order_detail.scan_verify_button')}
                </button>
                {order.items.length > 1 && (
                  <button onClick={() => setSplitOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                    {t('page_order_detail.split_order_action')}
                  </button>
                )}
              </div>
            </div>
            {order.items.map((item) => (
              <div key={item.id} className="p-3">
                <PickingLineItem
                  itemId={item.id}
                  sku={item.sku}
                  productName={item.product_name}
                  imageUrl={item.image_url}
                  color={item.color}
                  size={item.size}
                  qty={item.qty}
                  pickedQty={item.picked_qty}
                  availableToPick={item.available_to_pick}
                  physicalStock={item.physical_stock}
                  isOversell={item.is_oversell}
                  hostName={item.host_name}
                  onPick={handlePick}
                  meta={<p className="text-sm font-semibold text-gray-700 float-right">{formatCurrency(item.price * item.qty)}</p>}
                />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-1 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>{t('page_order_detail.subtotal_label')}</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex items-center justify-between text-red-600">
                <span>{t('page_order_detail.discount_label')}</span>
                <span>-{formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            {order.additional_amount > 0 && (
              <div className="flex items-center justify-between text-gray-500">
                <span>{t('page_order_detail.additional_fee_label')}</span>
                <span>+{formatCurrency(order.additional_amount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-gray-500">
              <span>{t('page_order_detail.shipping_fee_label')} {order.free_shipping_override && <span className="text-[10px] text-green-600">{t('page_order_detail.free_manual_badge')}</span>}</span>
              <span>{order.shipping_fee > 0 ? `+${formatCurrency(order.shipping_fee)}` : t('page_order_detail.free_label')}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <span className="font-bold text-gray-800">{t('page_order_detail.total_label')}</span>
              <span className="text-lg font-extrabold text-brand-600">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-gray-700">{t('page_order_detail.pickup_method_label')}</p>
              <button onClick={() => setPickupModalOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                {t('page_order_detail.edit_pickup_button')}
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {order.pickup_chain_name || '-'}
              {order.pickup_store_name && ` · ${order.pickup_store_name}`}
              {order.pickup_store_code && <span className="font-mono"> #{order.pickup_store_code}</span>}
              {' · '}{formatCurrency(order.shipping_fee)}
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-1">{t('page_order_detail.shipping_address_label')}</p>
            <p className="text-sm text-gray-500">{order.shipping_address || '-'}</p>
          </div>

          {hostNames.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">{t('page_order_detail.sales_attribution_label')}</p>
              <p className="text-sm text-gray-500">{t('page_order_detail.host_live_label', { names: hostNames.join(', ') })}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">
                {t('page_order_detail.internal_notes_label')}
                {order.is_urgent && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                    {t('page_order_detail.urgent_badge')}
                  </span>
                )}
              </p>
              <button onClick={() => setNotesModalOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                {t('page_order_detail.edit_notes_button')}
              </button>
            </div>
            {order.is_urgent && order.notes_deadline && (
              <p className="text-xs text-red-600 mb-1">
                {t('page_order_detail.deadline_label')}: {new Date(order.notes_deadline).toLocaleString('id-ID')}
              </p>
            )}
            <p className="text-sm text-gray-500 whitespace-pre-wrap">{order.internal_notes || t('page_order_detail.no_notes')}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">{t('page_order_detail.attachments_label')}</p>
              <label className="text-xs font-semibold text-brand-600 hover:underline cursor-pointer">
                {uploading ? t('page_order_detail.uploading_label') : t('page_order_detail.upload_photo_button')}
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadAttachment} disabled={uploading} />
              </label>
            </div>
            {order.attachments?.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {order.attachments.map((url, i) => (
                  <a key={i} href={resolveUrl(url)} target="_blank" rel="noreferrer">
                    <img src={resolveUrl(url)} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t('page_order_detail.no_attachments')}</p>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">{t('page_order_detail.print_documents_label')}</p>
            <div className="flex gap-2 flex-wrap">
              {[
                ['invoice', t('page_order_detail.print_invoice')],
                ['label', t('page_order_detail.print_label')],
                ['packing-slip', t('page_order_detail.print_packing_slip')],
              ].map(([type, label]) => (
                <a
                  key={type}
                  href={`/orders/${order.id}/print/${type}`}
                  target="_blank" rel="noreferrer"
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  🖨️ {label}
                </a>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400">{t('page_order_detail.created_by_label', { name: order.created_by })} · {new Date(order.created_at).toLocaleString('id-ID')}</p>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          {nextOptions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">{t('page_order_detail.change_status_label')}</p>
              <div className="flex gap-2 flex-wrap">
                {nextOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleUpdateStatus(s)}
                    className={`text-sm font-semibold px-4 py-2 rounded-lg ${
                      s === 'cancelled' || s === 'return'
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-brand-600 text-white hover:bg-brand-700'
                    }`}
                  >
                    {actionLabel(s)}
                  </button>
                ))}
              </div>

              {pendingAction && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">
                    {t('page_order_detail.reason_prompt', { action: actionLabel(pendingAction) })}
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={t('page_order_detail.required_placeholder')}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdateStatus(pendingAction)} className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                      {t('common.confirm')}
                    </button>
                    <button onClick={() => { setPendingAction(null); setReason('') }} className="text-sm text-gray-500 px-4 py-2">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <div className="mt-2">
                  <p className="text-red-600 text-sm">{error}</p>
                  {error.includes('digabung') && (
                    <Link to="/orders/merge" className="text-xs font-semibold text-brand-600 hover:underline">
                      {t('page_merge_orders.heading')} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">{t('page_order_detail.todo_label')}</p>
            <ul className="space-y-1.5">
              {(todoByStatus[order.status] || []).map((key, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" /> {t(`page_order_detail.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 max-h-[28rem] overflow-y-auto">
            <p className="text-sm font-semibold text-gray-700 mb-3">{t('page_order_detail.status_history_label')}</p>
            <div className="space-y-3">
              {order.status_history.map((h, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-gray-700">
                      <span className="font-medium">{t(`status.${h.status_from}`, statusLabels[h.status_from] || h.status_from)}</span> → <span className="font-semibold">{t(`status.${h.status_to}`, statusLabels[h.status_to] || h.status_to)}</span>
                      <span className="text-gray-400"> {t('page_order_detail.changed_by_label', { name: h.changed_by })}</span>
                    </p>
                    {h.reason && <p className="text-xs text-gray-500">{t('page_order_detail.reason_label', { reason: h.reason })}</p>}
                    <p className="text-[11px] text-gray-400">{new Date(h.created_at).toLocaleString('id-ID')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {scanOpen && <ScanVerifyModal onMatch={handleScanMatch} onClose={() => setScanOpen(false)} />}
      {splitOpen && (
        <SplitOrderModal
          order={order}
          onClose={() => setSplitOpen(false)}
          onDone={(newOrderId) => navigate(`/orders/${newOrderId}`)}
        />
      )}
      {notesModalOpen && (
        <NotesModal order={order} onClose={() => setNotesModalOpen(false)} onDone={() => { setNotesModalOpen(false); load() }} />
      )}
      {pickupModalOpen && (
        <PickupMethodModal
          order={order}
          pickupChains={pickupChains}
          onClose={() => setPickupModalOpen(false)}
          onDone={() => { setPickupModalOpen(false); load() }}
        />
      )}
    </div>
  )
}
