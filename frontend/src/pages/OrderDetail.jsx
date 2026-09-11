import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../api/orders'
import { formatRupiah } from '../utils/format'
import { resolveUrl } from '../utils/image'
import StatusPill, { statusLabels } from '../components/StatusPill'

const transitions = {
  pending: ['confirm', 'cancelled'],
  confirm: ['packing', 'cancelled'],
  packing: ['picking', 'cancelled'],
  picking: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled', 'return'],
  delivered: ['return'],
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [error, setError] = useState('')

  function load() {
    getOrder(id).then(setOrder)
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

  if (!order) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Memuat...</div>

  const nextOptions = transitions[order.status] || []
  function actionLabel(s) {
    if (order.status === 'pending') {
      if (s === 'confirm') return 'Terima Order'
      if (s === 'cancelled') return 'Tolak Order'
    }
    return statusLabels[s]
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-800">{order.order_no}</h1>
        <StatusPill status={order.status} />
      </div>
      <p className="text-sm text-gray-500 mb-6">{order.customer_name} · {order.customer_phone}</p>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {order.items.map((item, i) => (
              <div key={i} className="flex gap-4 p-4">
                <img src={resolveUrl(item.image_url)} className="w-16 h-16 rounded-xl object-cover bg-gray-100" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{item.product_name}</p>
                  <p className="text-xs text-gray-500">{item.color} / {item.size} · {item.sku} &times; {item.qty}</p>
                  <p className="text-[11px] text-brand-600">Host: {item.host_name}</p>
                </div>
                <p className="font-semibold text-gray-700 text-sm">{formatRupiah(item.price * item.qty)}</p>
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
    </div>
  )
}
