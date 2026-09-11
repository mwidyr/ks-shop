import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addOrderAttachment, getOrder, pickOrderItem, splitOrder, updateOrderNotes, updateOrderStatus,
} from '../api/orders'
import { formatRupiah } from '../utils/format'
import { resolveUrl, uploadImageFile } from '../utils/image'
import StatusPill, { statusLabels } from '../components/StatusPill'
import PickingLineItem from '../components/PickingLineItem'
import ScanVerifyModal from '../components/ScanVerifyModal'
import { IconClose } from '../components/icons'

const transitions = {
  pending: ['confirm', 'cancelled'],
  confirm: ['packing', 'cancelled'],
  packing: ['picking', 'cancelled'],
  picking: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled', 'return'],
  delivered: ['return'],
}

const todoByStatus = {
  pending: ['Menunggu konfirmasi order'],
  confirm: ['Menunggu pengambilan selesai', 'Menunggu pengiriman'],
  packing: ['Menunggu pengambilan selesai', 'Menunggu pengiriman'],
  picking: ['Pengambilan selesai', 'Menunggu pengiriman'],
  shipped: ['Dalam pengiriman ke titik pengambilan'],
  delivered: ['Pesanan selesai'],
  cancelled: ['Pesanan dibatalkan'],
  return: ['Pesanan diretur'],
}

function SplitOrderModal({ order, onClose, onDone }) {
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
      setError('Pilih sebagian item (bukan semua) untuk dipisah ke order baru')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await splitOrder(order.id, [...selected])
      onDone(res.new_order_id)
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal memisahkan order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Pisah Pesanan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Pilih item yang mau dipindah ke order baru.</p>
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
          {saving ? 'Memproses...' : 'Pisah Pesanan'}
        </button>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [error, setError] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)

  function load() {
    getOrder(id).then((o) => { setOrder(o); setNotesDraft(o.internal_notes || '') })
  }

  useEffect(() => { load() }, [id])

  async function handleUpdateStatus(status) {
    setError('')
    if ((status === 'cancelled' || status === 'return') && !reason) {
      setPendingAction(status)
      return
    }
    try {
      await updateOrderStatus(id, status, reason)
      setReason('')
      setPendingAction(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal update status')
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

  async function saveNotes() {
    setNotesSaving(true)
    setNotesSaved(false)
    try {
      await updateOrderNotes(id, notesDraft)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } finally {
      setNotesSaving(false)
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

  if (!order) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Memuat...</div>

  const nextOptions = transitions[order.status] || []
  function actionLabel(s) {
    if (order.status === 'pending') {
      if (s === 'confirm') return 'Terima Order'
      if (s === 'cancelled') return 'Tolak Order'
    }
    return statusLabels[s]
  }

  const hostNames = [...new Set(order.items.map((it) => it.host_name).filter((n) => n && n !== '-'))]
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0)
  const totalPicked = order.items.reduce((s, it) => s + it.picked_qty, 0)
  const progres = totalPicked === 0 ? 'Menunggu diambil' : totalPicked < totalQty ? `Diambil ${totalPicked}/${totalQty}` : 'Pengambilan selesai'

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-800">{order.order_no}</h1>
        <StatusPill status={order.status} />
      </div>
      <p className="text-sm text-gray-500 mb-6">{order.customer_name} · {order.customer_phone}</p>

      {order.customer_blacklisted && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">
          ⚠️ Pelanggan ini ditandai sebagai daftar hitam. Periksa dulu sebelum memproses pesanan ini.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] uppercase text-gray-400 mb-0.5">Tahap Pesanan</p>
              <StatusPill status={order.status} />
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-400 mb-0.5">Progres Pemenuhan</p>
              <p className="font-semibold text-gray-700">{progres}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">Kontak Pelanggan</p>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{order.customer_name}</p>
              <a href={`tel:${order.customer_phone}`} className="text-sm text-brand-600 font-medium hover:underline">☎ {order.customer_phone}</a>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm divide-y">
            <div className="p-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Rincian Produk · {order.items.length}</p>
              <div className="flex gap-2">
                <button onClick={() => setScanOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                  📷 Pindai Verifikasi
                </button>
                {order.items.length > 1 && (
                  <button onClick={() => setSplitOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Pisah Pesanan
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
                  meta={<p className="text-sm font-semibold text-gray-700 float-right">{formatRupiah(item.price * item.qty)}</p>}
                />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-1 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatRupiah(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex items-center justify-between text-red-600">
                <span>Diskon</span>
                <span>-{formatRupiah(order.discount_amount)}</span>
              </div>
            )}
            {order.additional_amount > 0 && (
              <div className="flex items-center justify-between text-gray-500">
                <span>Biaya Tambahan</span>
                <span>+{formatRupiah(order.additional_amount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <span className="font-bold text-gray-800">Total</span>
              <span className="text-lg font-extrabold text-brand-600">{formatRupiah(order.total)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">Metode Pengambilan</p>
            <p className="text-sm text-gray-500 mb-3">
              {order.pickup_chain_name || '-'}
              {order.pickup_store_name && ` · ${order.pickup_store_name}`}
              {order.pickup_store_code && <span className="font-mono"> #{order.pickup_store_code}</span>}
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-1">Alamat Pengiriman</p>
            <p className="text-sm text-gray-500">{order.shipping_address || '-'}</p>
          </div>

          {hostNames.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">Atribusi Penjualan</p>
              <p className="text-sm text-gray-500">Host Live: {hostNames.join(', ')}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Catatan Internal</p>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              placeholder="Belum ada catatan..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="flex items-center gap-2">
              <button onClick={saveNotes} disabled={notesSaving} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50">
                {notesSaving ? 'Menyimpan...' : 'Simpan Catatan'}
              </button>
              {notesSaved && <span className="text-xs text-green-600">Tersimpan</span>}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Lampiran</p>
              <label className="text-xs font-semibold text-brand-600 hover:underline cursor-pointer">
                {uploading ? 'Mengunggah...' : '+ Unggah foto'}
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
              <p className="text-xs text-gray-400">Belum ada lampiran.</p>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Cetak Dokumen</p>
            <div className="flex gap-2 flex-wrap">
              {[
                ['invoice', 'Invoice'],
                ['label', 'Label Pengiriman'],
                ['packing-slip', 'Packing Slip'],
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

          <p className="text-xs text-gray-400">Dibuat oleh {order.created_by} · {new Date(order.created_at).toLocaleString('id-ID')}</p>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          {nextOptions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Ubah Status</p>
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
                    Alasan untuk "{actionLabel(pendingAction)}":
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Wajib diisi..."
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdateStatus(pendingAction)} className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                      Konfirmasi
                    </button>
                    <button onClick={() => { setPendingAction(null); setReason('') }} className="text-sm text-gray-500 px-4 py-2">
                      Batal
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">To-Do</p>
            <ul className="space-y-1.5">
              {(todoByStatus[order.status] || []).map((t, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 max-h-[28rem] overflow-y-auto">
            <p className="text-sm font-semibold text-gray-700 mb-3">Riwayat Status</p>
            <div className="space-y-3">
              {order.status_history.map((h, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-gray-700">
                      <span className="font-medium">{h.status_from}</span> → <span className="font-semibold">{statusLabels[h.status_to] || h.status_to}</span>
                      <span className="text-gray-400"> oleh {h.changed_by}</span>
                    </p>
                    {h.reason && <p className="text-xs text-gray-500">Alasan: {h.reason}</p>}
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
    </div>
  )
}
