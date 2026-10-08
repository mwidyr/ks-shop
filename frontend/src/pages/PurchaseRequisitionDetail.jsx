import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPurchaseRequisition, addRequisitionItem, removeRequisitionItem, updateRequisitionItemQty,
  updateRequisitionSupplierGroup, submitForConfirmation, confirmOrder,
  updatePurchaseRequisition, deletePurchaseRequisition,
  addRequisitionNote, updateRequisitionNote, deleteRequisitionNote,
} from '../api/purchaseRequisitions'
import ProductPickerModal from '../components/ProductPickerModal'
import { formatCNY } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, cardClasses } from '../components/Table'
import { IconTrash, IconPlus, IconChevronDown, IconClipboard } from '../components/icons'
import { useMasterData } from '../context/MasterDataContext'

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

// Supplier notes: a log (added one by one, like Supplier Profile > Notes). Always editable, in
// every requisition status - including after the supplier group is confirmed and the PO exists.
function NotesLog({ groupId, notes, onChanged }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  async function run(fn) {
    setError('')
    try { await fn(); onChanged() } catch (err) { setError(err.response?.data?.error || t('page_purchase_requisitions.notes_save_failed')) }
  }
  const add = (e) => { e.preventDefault(); if (!draft.trim()) return; run(async () => { await addRequisitionNote(groupId, draft.trim()); setDraft('') }) }
  const save = (id) => { if (!editText.trim()) return; run(async () => { await updateRequisitionNote(id, editText.trim()); setEditingId(null) }) }

  return (
    <div className="p-4 border-t border-[var(--table-divider)] space-y-2">
      <label className="block text-[11px] text-gray-500">{t('page_purchase_requisitions.group_notes')}</label>
      <form onSubmit={add} className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('page_purchase_requisitions.notes_add_placeholder')}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <button type="submit" disabled={!draft.trim()} className="bg-gray-800 text-white text-sm font-semibold px-4 rounded-lg disabled:opacity-40">{t('page_purchase_requisitions.notes_add_button')}</button>
      </form>
      {notes.length === 0 ? (
        <p className="text-xs text-gray-400">{t('page_purchase_requisitions.notes_empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="text-sm border border-[var(--table-divider)] rounded-lg px-3 py-2">
              {editingId === n.id ? (
                <div className="flex gap-2">
                  <input value={editText} onChange={(e) => setEditText(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm" autoFocus />
                  <button onClick={() => save(n.id)} className="text-xs font-semibold text-brand-600 hover:underline">{t('common.save')}</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-gray-700 whitespace-pre-line break-words">{n.note}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{n.created_by_name} · {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-3 shrink-0 text-xs">
                    <button onClick={() => { setEditingId(n.id); setEditText(n.note) }} className="text-gray-500 hover:text-brand-600">{t('page_purchase_requisitions.notes_edit')}</button>
                    <button onClick={() => run(() => deleteRequisitionNote(n.id))} className="text-gray-400 hover:text-red-600">{t('page_purchase_requisitions.notes_delete')}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function SupplierGroupCard({ group, requisitionStatus, onChanged, onLive }) {
  const { t } = useTranslation()
  // translateColor is deliberately NOT used in handleCopy's grouping below - that text is sent
  // to the (Chinese-speaking) supplier and must always show the Chinese color name, regardless
  // of the staff member's current UI locale. It's only applied to the on-screen items table.
  const { translateColor, toChineseColor } = useMasterData()
  const [items, setItems] = useState(() => Object.fromEntries(group.items.map((it) => [it.id, {
    planned_qty: it.planned_qty, unit_cost: it.unit_cost ?? '',
  }])))
  // group.items only seeds local state once (useState initializer) - without this, an item
  // added to this SAME group later (item 076) never gets an entry here, so its Planned/Confirmed
  // Qty inputs render blank until the user types in them, even though the row itself displays
  // fine (driven directly by the group.items prop). Only ADDS missing entries, never overwrites
  // one already being edited.
  useEffect(() => {
    setItems((prev) => {
      let changed = false
      const next = { ...prev }
      for (const it of group.items) {
        if (!(it.id in next)) {
          next[it.id] = { planned_qty: it.planned_qty, unit_cost: it.unit_cost ?? '' }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [group.items])
  // Notes are a log (added one by one, editable in every status) - see NotesLog below.
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)
  const [qtyError, setQtyError] = useState('')

  const isPendingContact = requisitionStatus === 'pending_contact'
  // Planned QTY stays editable after the order is confirmed (purchasing is in-house); the change
  // flows into the supplier PO and Incoming on the backend. Only a completed requisition is locked.
  const canEditPlanned = requisitionStatus === 'draft' || isPendingContact || requisitionStatus === 'ordered'
  const canConfirm = isPendingContact

  // Tell the page what is being typed so its header totals (Total Quantity / Total Amount) move
  // instantly too, not only after the save-on-blur round trip.
  useEffect(() => { onLive?.(group.id, items) }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePlannedQty(item) {
    const planned = Number(items[item.id]?.planned_qty)
    if (!planned || planned <= 0) return
    setSaving(true)
    try {
      await updateRequisitionItemQty(item.id, planned)
      setQtyError('')
      onChanged()
    } catch (err) {
      // e.g. below what the supplier PO has already received - show why and restore the saved qty.
      setQtyError(err.response?.data?.error || t('page_purchase_requisitions.qty_save_failed'))
      setItems((s) => ({ ...s, [item.id]: { ...s[item.id], planned_qty: item.planned_qty } }))
    } finally {
      setSaving(false)
    }
  }

  async function saveConfirmation(status) {
    setSaving(true)
    try {
      const itemsPayload = Object.entries(items).map(([id, v]) => ({
        id: Number(id),
        unit_cost: v.unit_cost === '' ? null : Number(v.unit_cost),
      }))
      await updateRequisitionSupplierGroup(group.id, { items: itemsPayload, ...(status ? { status } : {}) })
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
    const q = Number(v.planned_qty ?? it.planned_qty) || 0
    const c = Number(v.unit_cost) || 0
    return sum + q * c
  }, 0)
  const totalQty = group.items.reduce((sum, it) => sum + (Number(items[it.id]?.planned_qty ?? it.planned_qty) || 0), 0)

  // WeChat-ready copy text (item 056, format updated per item 077): grouped by the supplier's
  // product (vendor_sku + Product Code only decide the grouping now), headed by the product NAME -
  // it.product_name is the Chinese name from the backend (falling back to the main name when no
  // Chinese name was entered), regardless of the staff member's UI language. Color uses
  // toChineseColor (NOT translateColor, which follows the staff member's current UI locale) so
  // the copied text always shows the Chinese name from Color Master, even for legacy items whose
  // raw stored color is actually Indonesian text entered before Color Master existed - confirmed
  // broken in practice (e.g. "Mocca", "Abu Muda", "Navy" showing up in copy text for older SKUs).
  // One line per color with its purchase qty. Name/Address are left blank - this is a message
  // template to send the supplier, not a real contact record.
  function buildCopyText() {
    const groups = []
    const byKey = new Map()
    for (const it of group.items) {
      const key = (it.vendor_sku || '') + '\u0000' + it.product_sku
      let g = byKey.get(key)
      if (!g) {
        g = { name: it.product_name, lines: [] }
        byKey.set(key, g)
        groups.push(g)
      }
      const qty = Number(items[it.id]?.planned_qty ?? it.planned_qty) || 0
      g.lines.push(`${toChineseColor(it.color)} : ${qty}`)
    }
    const parts = ['姓名 : ', '地址 : ', '']
    groups.forEach((g, idx) => {
      parts.push(g.name)
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
              <th className="p-2 pr-4"></th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {group.items.map((it) => {
              const v = items[it.id] || {}
              const amount = (Number(v.planned_qty ?? it.planned_qty) || 0) * (Number(v.unit_cost) || 0)
              return (
                <tr key={it.id}>
                  <td className="p-2 pl-4 font-mono text-xs text-brand-600">{it.product_sku}</td>
                  <td className="p-2 text-[var(--text-primary)]">{it.product_name}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{translateColor(it.color)}/{it.size}</td>
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

      {qtyError && <p className="px-4 pb-2 text-xs text-red-600">{qtyError}</p>}
      <NotesLog groupId={group.id} notes={group.notes_log || []} onChanged={onChanged} />
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
  // What is currently typed in each supplier section, keyed by group id - lets the header totals
  // follow Planned QTY / Unit Cost instantly instead of waiting for the save-on-blur reload.
  const [live, setLive] = useState({})
  const onLive = useCallback((groupId, items) => setLive((cur) => (cur[groupId] === items ? cur : { ...cur, [groupId]: items })), [])

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
    setError('')
    // Each item is independent (item 076) - previously a single `for...await` loop meant one
    // failing item (e.g. a product with no Supplier set, which AddItem rejects) silently aborted
    // every item after it with zero feedback, looking exactly like "can't add a second product".
    const results = await Promise.allSettled(
      pickerItems.map((it) => addRequisitionItem(detail.id, { variant_id: it.variantId, planned_qty: it.qty }))
    )
    const failed = results
      .map((res, i) => ({ res, it: pickerItems[i] }))
      .filter(({ res }) => res.status === 'rejected')
    if (failed.length > 0) {
      setError(failed.map(({ res, it }) => `${it.productName}: ${res.reason?.response?.data?.error || t('page_purchase_requisitions.add_product_failed')}`).join(' / '))
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
  const liveQty = (g, it) => {
    const v = live[g.id]?.[it.id]
    return v ? (Number(v.planned_qty) || 0) : it.planned_qty
  }
  const liveCost = (g, it) => {
    const v = live[g.id]?.[it.id]
    return v && v.unit_cost !== '' && v.unit_cost != null ? (Number(v.unit_cost) || 0) : (it.unit_cost || 0)
  }
  const totalQty = detail.suppliers.reduce((sum, g) => sum + g.items.reduce((s, it) => s + liveQty(g, it), 0), 0)
  const totalAmount = detail.suppliers.reduce((sum, g) => sum + g.items.reduce((s, it) => s + liveQty(g, it) * liveCost(g, it), 0), 0)

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
      {pickerOpen && <ProductPickerModal onClose={() => setPickerOpen(false)} onAdd={handleAddProducts} nameLang="zh" />}

      {(isPendingContact || isOrdered || detail.status === 'completed') && (
        <p className="text-xs text-gray-400">{t('page_purchase_requisitions.completes_hint')}</p>
      )}

      {detail.suppliers.map((g) => (
        <SupplierGroupCard key={g.id} group={{ ...g, requisition_id: detail.id }} requisitionStatus={detail.status} onChanged={reload} onLive={onLive} />
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
