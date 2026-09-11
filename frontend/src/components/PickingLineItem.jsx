import { useState } from 'react'
import { resolveUrl } from '../utils/image'

// Shared picking control: qty stepper + checkmark "confirm picked" action, with the
// reference's "Bisa ambil X · Fisik Y" stock line and an oversell warning. Used both on
// the order-detail page and the cross-order Daftar Pengambilan queue.
export default function PickingLineItem({
  itemId, sku, productName, imageUrl, color, size, qty, pickedQty,
  availableToPick, physicalStock, isOversell, hostName, onPick, meta,
}) {
  const [draft, setDraft] = useState(pickedQty)
  const [saving, setSaving] = useState(false)
  const confirmed = draft >= qty

  async function save(next) {
    const clamped = Math.max(0, Math.min(qty, next))
    setDraft(clamped)
    setSaving(true)
    try {
      await onPick(itemId, clamped)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex gap-3">
        <img src={resolveUrl(imageUrl)} className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
        <div className="flex-1 min-w-0">
          {meta}
          <p className="text-xs font-mono text-brand-600">{sku}</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{productName}</p>
          <p className="text-xs text-gray-500">{color} / {size}</p>
          {hostName && <p className="text-[11px] text-brand-600">Host: {hostName}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className={`text-xs font-mono ${isOversell ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          Bisa ambil {availableToPick} · Fisik {physicalStock}
          {isOversell && <span> ⚠️ Oversell, perlu restock</span>}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => save(draft - 1)} disabled={saving || draft <= 0} className="w-7 h-7 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40">−</button>
          <span className="w-12 text-center text-sm font-mono">{draft}/{qty}</span>
          <button type="button" onClick={() => save(draft + 1)} disabled={saving || draft >= qty} className="w-7 h-7 rounded-lg bg-orange-500 text-white disabled:opacity-40">+</button>
          <button
            type="button"
            onClick={() => save(qty)}
            disabled={saving}
            title="Tandai selesai diambil"
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${confirmed ? 'bg-green-500 text-white' : 'border border-gray-300 text-gray-400'}`}
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  )
}
