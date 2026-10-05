import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPurchaseRequisition, addRequisitionItem, removeRequisitionItem,
  updateRequisitionSupplierGroup, submitForConfirmation, confirmOrder,
  updatePurchaseRequisition, deletePurchaseRequisition,
} from '../api/purchaseRequisitions'
import { getPurchase, receivePurchase } from '../api/purchases'
import ProductPickerModal from '../components/ProductPickerModal'
import { formatCNY } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, cardClasses } from '../components/Table'
import { IconTrash, IconPlus, IconChevronDown, IconClipboard } from '../components/icons'

const groupStatusColors = {
  pending_contact: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
}

const requisitionStatusColors = {
  draft: 'bg-yellow-100 text-yellow-700',
  pending_contact: 'bg-amber-100 text-amber-700',
  ordered: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

function SupplierGroupCard({ group, requisitionStatus, onChanged }) {
  const { t } = useTranslation()
  const [items, setItems] = useState(() => Object.fromEntries(group.items.map((it) => [it.id, {
    planned_qty: it.planned_qty, confirmed_qty: it.confirmed_qty ?? it.planned_qty, unit_cost: it.unit_cost ?? '',
  }])))
  const [notes, setNotes] = useState(group.notes || '')
  const [saving, setSaving] = useState(false)
  const [po, setPo] = useState(null)
  const [actualQty, setActualQty] = useState({})
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const isPendingContact = requisitionStatus === 'pending_contact'
  const isOrdered = requisitionStatus === 'ordered'
  const canEditPlanned = requisitionStatus === 'draft' || isPendingContact
  const canEditNotes = requisitionStatus === 'draft' || isPendingContact
  const canConfirm = isPendingContact
  const canReceive = isOrdered && po && (po.status === 'ordered' || po.status === 'pending_arrival')

  useEffect(() => {
    if (group.purchase_id && (isOrdered || requisitionStatus === 'completed')) {
      getPurchase(group.purchase_id).then((p) => {
        setPo(p)
        setActualQty((prev) => {
          const next = { ...prev }
          for (const it of p.items) if (next[it.variant_id] === undefined) next[it.variant_id] = it.qty
          return next
        })
      })
    }
  }, [group.purchase_id, requisitionStatus])

  function poItemFor(variantId) {
    return po?.items.find((it) => it.variant_id === variantId)
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

  async function saveConfirmation(status) {
    setSaving(true)
    try {
      const itemsPayload = Object.entries(items).map(([id, v]) => ({
        id: Number(id),
        confirmed_qty: v.confirmed_qty === '' ? null : Number(v.confirmed_qty),
        unit_cost: v.unit_cost === '' ? null : Number(v.unit_cost),
      }))
      await updateRequisitionSupplierGroup(group.id, { notes, items: itemsPayload, ...(status ? { status } : {}) })
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(itemId) {
    await removeRequisitionItem(itemId)
    onChanged()
  }

  async function confirmReceived() {
    if (!po) return
    setSaving(true)
    try {
      const payload = po.items.map((it) => ({ id: it.id, received_qty: Number(actualQty[it.variant_id] ?? it.qty) }))
      await receivePurchase(group.purchase_id, payload)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const total = group.items.reduce((sum, it) => {
    const v = items[it.id] || {}
    const q = Number(v.confirmed_qty ?? it.planned_qty) || 0
    const c = Number(v.unit_cost) || 0
    return sum + q * c
  }, 0)
  const totalQty = group.items.reduce((sum, it) => sum + (Number(items[it.id]?.confirmed_qty ?? it.planned_qty) || 0), 0)

  // WeChat-ready copy text (item 056): grouped by the supplier's own product code/name (not our
  // internal SKU), one line per color with its purchase qty. Name/Address are left blank - this
  // is a message template to send the supplier, not pulled from any real contact record.
  function buildCopyText() {
    const groups = []
    const byKey = new Map()
    for (const it of group.items) {
      const key = (it.vendor_sku || '') + '\u0000' + it.product_name
      let g = byKey.get(key)
      if (!g) {
        g = { vendorSku: it.vendor_sku || '', productName: it.product_name, lines: [] }
        byKey.set(key, g)
        groups.push(g)
      }
      const qty = Number(items[it.id]?.confirmed_qty ?? it.planned_qty) || 0
      g.lines.push(`${it.color} : ${qty}`)
    }
    const parts = ['姓名 : ', '地址 : ', '']
    groups.forEach((g, idx) => {
      parts.push(g.vendorSku ? `${g.vendorSku}# ${g.productName}` : g.productName)
      parts.push(...g.lines)
      if (idx < groups.length - 1) parts.push('')
    })
    return parts.join('\n')
  }

  async function handleCopy(e) {
    e.stopPropagation()
    const text = buildCopyText()
    try {
      if (!navigator.clipboard) throw new Error('clipboard API unavailable')
      await navigator.clipboard.writeText(text)
    } catch {
      // navigator.clipboard needs a secure context (HTTPS or localhost) - on a plain HTTP
      // deployment (e.g. an IP-only test VPS) it's undefined entirely. Fall back to the old
      // execCommand('copy') trick: a temporary off-screen textarea, select it, copy, remove it -
      // this still works on plain HTTP.
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
      } catch {
        // both methods unavailable - give up silently, button just won't show "Copied!"
      }
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`${cardClasses} overflow-hidden`}>
      <div
        className="flex items-center justify-between gap-3 p-4 border-b border-[var(--table-divider)] flex-wrap cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <IconChevronDown width={16} height={16} className={`text-[var(--text-secondary)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <h3 className="font-bold text-[var(--text-primary)]">{group.supplier_name}</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]" onClick={(e) => e.stopPropagation()}>
          <span>{group.items.length} {t('page_purchase_requisitions.stat_products')}</span>
          <span>{totalQty} {t('page_purchase_requisitions.pcs_suffix')}</span>
          <span className="font-semibold text-[var(--text-primary)]">{formatCNY(total)}</span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={group.items.length === 0}
            title={t('page_purchase_requisitions.copy_for_wechat')}
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border border-[var(--table-divider)] text-[var(--text-secondary)] hover:bg-gray-50 disabled:opacity-40"
          >
            <IconClipboard width={13} height={13} />
            {copied ? t('page_purchase_requisitions.copied') : t('page_purchase_requisitions.copy_button')}
          </button>
          {canConfirm ? (
            <select
              value={group.status}
              onChange={(e) => saveConfirmation(e.target.value)}
              disabled={saving}
              className={`text-[11px] font-semibold px-2 py-1 rounded-full border-0 ${groupStatusColors[group.status]}`}
            >
              <option value="pending_contact">{t('page_purchase_requisitions.group_status_pending_contact')}</option>
              <option value="confirmed">{t('page_purchase_requisitions.group_status_confirmed')}</option>
            </select>
          ) : (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${groupStatusColors[group.status]}`}>
              {t(`page_purchase_requisitions.group_status_${group.status}`)}
            </span>
          )}
        </div>
      </div>

      {expanded && (
      <>
      <div className="overflow-x-auto">
        <table className={tableClasses}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-2 pl-4">{t('page_purchase_requisitions.col_product_code')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_product_name')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_color_size')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_planned_qty')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_unit_cost')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_amount')}</th>
              <th className="p-2">{t('page_purchase_requisitions.col_actual_qty')}</th>
              <th className="p-2 pr-4"></th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {group.items.map((it) => {
              const v = items[it.id] || {}
              const amount = (Number(v.confirmed_qty ?? it.planned_qty) || 0) * (Number(v.unit_cost) || 0)
              const poItem = poItemFor(it.variant_id)
              return (
                <tr key={it.id}>
                  <td className="p-2 pl-4 font-mono text-xs text-brand-600">{it.product_sku}</td>
                  <td className="p-2 text-[var(--text-primary)]">{it.product_name}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{it.color}/{it.size}</td>
                  <td className="p-2">
                    {canEditPlanned ? (
                      <input
                        type="number" min="0" value={v.planned_qty ?? ''}
                        onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], planned_qty: e.target.value } }))}
                        onBlur={() => savePlannedQty(it)}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)]">{it.planned_qty}</span>
                    )}
                    {canConfirm && (
                      <input
                        type="number" min="0" placeholder={t('page_purchase_requisitions.confirmed_qty_placeholder')}
                        value={v.confirmed_qty ?? ''}
                        onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], confirmed_qty: e.target.value } }))}
                        onBlur={() => saveConfirmation(null)}
                        className="w-24 mt-1 border border-gray-300 rounded-lg px-2 py-1 text-xs block"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {canConfirm ? (
                      <input
                        type="number" min="0" value={v.unit_cost ?? ''}
                        onChange={(e) => setItems((s) => ({ ...s, [it.id]: { ...s[it.id], unit_cost: e.target.value } }))}
                        onBlur={() => saveConfirmation(null)}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)]">{formatCNY(it.unit_cost || 0)}</span>
                    )}
                  </td>
                  <td className="p-2 font-semibold text-[var(--text-primary)]">{formatCNY(amount)}</td>
                  <td className="p-2">
                    {canReceive ? (
                      <input
                        type="number" min="0" value={actualQty[it.variant_id] ?? poItem?.qty ?? ''}
                        onChange={(e) => setActualQty((s) => ({ ...s, [it.variant_id]: e.target.value }))}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      />
                    ) : requisitionStatus === 'completed' ? (
                      <span className="text-green-600 font-semibold">{poItem?.received_qty ?? '-'}</span>
                    ) : (
                      <input type="number" value="" disabled placeholder="-" className="w-20 border border-gray-200 bg-gray-50 rounded-lg px-2 py-1 text-sm text-gray-300" />
                    )}
                  </td>
                  <td className="p-2 pr-4 text-right">
                    {canEditPlanned && (
                      <button onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-red-600"><IconTrash width={14} height={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-[var(--table-divider)] space-y-3">
        {(canEditNotes || group.notes) && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_purchase_requisitions.group_notes')}</label>
            {canEditNotes ? (
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => saveConfirmation(null)} rows={2}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            ) : (
              <p className="text-sm text-gray-600">{group.notes}</p>
            )}
          </div>
        )}
        {canReceive && (
          <button onClick={confirmReceived} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
            {t('page_purchase_requisitions.confirm_received_button')}
          </button>
        )}
      </div>
      </>
      )}
    </div>
  )
}

export default function PurchaseRequisitionDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  function reload() {
    getPurchaseRequisition(id).then(setDetail)
  }

  useEffect(reload, [id])

  async function handleSubmitForConfirmation() {
    setError('')
    setBusy(true)
    try {
      await submitForConfirmation(id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_purchase_requisitions.submit_for_confirmation_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmOrder() {
    setError('')
    setBusy(true)
    try {
      await confirmOrder(id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_purchase_requisitions.confirm_order_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddProducts(pickerItems) {
    for (const it of pickerItems) {
      await addRequisitionItem(detail.id, { variant_id: it.variantId, planned_qty: it.qty })
    }
    reload()
  }

  async function saveNote() {
    await updatePurchaseRequisition(id, { note: noteDraft })
    setEditingNote(false)
    reload()
  }

  async function handleDelete() {
    if (!window.confirm(t('page_purchase_requisitions.delete_confirm', { no: detail.requisition_no }))) return
    await deletePurchaseRequisition(id)
    navigate('/purchase-requisitions')
  }

  if (!detail) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  const isDraft = detail.status === 'draft'
  const isPendingContact = detail.status === 'pending_contact'
  const isOrdered = detail.status === 'ordered'
  const canDelete = isDraft || isPendingContact
  const allConfirmed = detail.suppliers.length > 0 && detail.suppliers.every((g) => g.status === 'confirmed')

  const totalProducts = new Set(detail.suppliers.flatMap((g) => g.items.map((it) => it.product_sku))).size
  const totalQty = detail.suppliers.reduce((sum, g) => sum + g.items.reduce((s, it) => s + (it.confirmed_qty ?? it.planned_qty), 0), 0)
  const totalAmount = detail.suppliers.reduce((sum, g) => sum + g.items.reduce((s, it) => s + (it.confirmed_qty ?? it.planned_qty) * (it.unit_cost || 0), 0), 0)

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl space-y-4">
      <button onClick={() => navigate('/purchase-requisitions')} className="text-sm text-gray-500 hover:text-gray-800">
        ← {t('page_purchase_requisitions.back_button')}
      </button>

      <div className={`${cardClasses} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-[var(--text-primary)]">{detail.requisition_no}</h2>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${requisitionStatusColors[detail.status]}`}>
              {t(`page_purchase_requisitions.status_${detail.status}`)}
            </span>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => { setNoteDraft(detail.note || ''); setEditingNote(true) }}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              {t('page_purchase_requisitions.header_edit_button')}
            </button>
            <button onClick={() => setMenuOpen((o) => !o)} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">⋯</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                  <button
                    onClick={handleDelete}
                    disabled={!canDelete}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-50 w-full text-left disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    <IconTrash width={14} height={14} /> {t('page_purchase_requisitions.header_delete_option')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {editingNote ? (
          <div className="mb-3 flex gap-2 items-start">
            <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <div className="flex flex-col gap-1">
              <button onClick={saveNote} className="text-xs font-semibold text-brand-600 hover:underline">{t('common.save')}</button>
              <button onClick={() => setEditingNote(false)} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
            <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchase_requisitions.header_created_date')}</p><p className="text-gray-700">{new Date(detail.created_at).toLocaleDateString()}</p></div>
            <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchase_requisitions.header_created_by')}</p><p className="text-gray-700">{detail.created_by_name || '-'}</p></div>
            <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchase_requisitions.header_last_updated')}</p><p className="text-gray-700">{new Date(detail.updated_at).toLocaleString()}</p></div>
            <div><p className="text-[11px] text-gray-400 uppercase">{t('page_purchase_requisitions.header_note')}</p><p className="text-gray-700 truncate">{detail.note || '–'}</p></div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
          <div><p className="text-lg font-bold text-gray-800">{detail.suppliers.length}</p><p className="text-xs text-gray-400">{t('page_purchase_requisitions.stat_suppliers')}</p></div>
          <div><p className="text-lg font-bold text-gray-800">{totalProducts}</p><p className="text-xs text-gray-400">{t('page_purchase_requisitions.stat_products')}</p></div>
          <div><p className="text-lg font-bold text-gray-800">{totalQty} {t('page_purchase_requisitions.pcs_suffix')}</p><p className="text-xs text-gray-400">{t('page_purchase_requisitions.stat_total_quantity')}</p></div>
          <div><p className="text-lg font-bold text-brand-600">{formatCNY(totalAmount)}</p><p className="text-xs text-gray-400">{t('page_purchase_requisitions.stat_total_amount')}</p></div>
        </div>
      </div>

      {isDraft && (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full border-2 border-dashed border-brand-300 text-brand-600 font-semibold text-sm py-3 rounded-xl hover:bg-brand-50 flex items-center justify-center gap-1.5"
        >
          <IconPlus width={14} height={14} /> {t('page_purchase_requisitions.add_product_button')}
        </button>
      )}
      {pickerOpen && <ProductPickerModal onClose={() => setPickerOpen(false)} onAdd={handleAddProducts} />}

      {(isPendingContact || isOrdered || detail.status === 'completed') && (
        <p className="text-xs text-gray-400">{t('page_purchase_requisitions.completes_hint')}</p>
      )}

      {detail.suppliers.map((g) => (
        <SupplierGroupCard key={g.id} group={{ ...g, requisition_id: detail.id }} requisitionStatus={detail.status} onChanged={reload} />
      ))}

      {detail.suppliers.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">{t('page_purchase_requisitions.no_items_yet')}</p>
      )}

      {isDraft && (
        <div className={`${cardClasses} p-5`}>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={handleSubmitForConfirmation} disabled={detail.suppliers.length === 0 || busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">
            {busy ? t('page_purchase_requisitions.submitting_for_confirmation') : t('page_purchase_requisitions.submit_for_confirmation_button')}
          </button>
        </div>
      )}

      {isPendingContact && (
        <div className={`${cardClasses} p-5`}>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={handleConfirmOrder} disabled={!allConfirmed || busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">
            {busy ? t('page_purchase_requisitions.confirming_order') : t('page_purchase_requisitions.confirm_order_button')}
          </button>
          {!allConfirmed && <p className="text-xs text-gray-400 mt-2">{t('page_purchase_requisitions.confirm_order_hint')}</p>}
        </div>
      )}
    </div>
  )
}
