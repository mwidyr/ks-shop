import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getLiveSession, updateLiveSession, goLiveSession, endLiveSession,
  addLiveSessionProduct, removeLiveSessionProduct,
} from '../api/liveSessions'
import { listProducts } from '../api/products'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import SessionStatusPill from '../components/SessionStatusPill'
import { IconClose, IconPlus, IconTrash } from '../components/icons'

function AddProductModal({ variants, onAdd, onClose }) {
  const [variantId, setVariantId] = useState('')
  const [livePrice, setLivePrice] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!variantId || !livePrice) return
    setSaving(true)
    try {
      await onAdd(Number(variantId), Number(livePrice))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Tambah Produk ke Keranjang Live</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Pilih Produk *</label>
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4"
            required
          >
            <option value="">Pilih produk...</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.productName} — {v.color}/{v.size} ({v.sku})</option>
            ))}
          </select>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Harga Live *</label>
          <input
            type="number" min="1"
            value={livePrice}
            onChange={(e) => setLivePrice(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-5"
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !variantId || !livePrice} className="bg-gray-800 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-5 py-2 rounded-full">
              {saving ? 'Menambah...' : 'Tambah'}
            </button>
            <button type="button" onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LiveSessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [cart, setCart] = useState([])
  const [variants, setVariants] = useState([])
  const [hosts, setHosts] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    getLiveSession(id).then((res) => {
      setSession(res.session)
      setCart(res.cart)
      setLabelDraft(res.session.label)
    })
  }

  useEffect(reload, [id])
  useEffect(() => {
    listHosts().then(setHosts)
    listProducts().then((products) => {
      setVariants(products.flatMap((p) => p.variants.map((v) => ({ ...v, productName: p.name }))))
    })
  }, [])

  async function saveLabel() {
    if (labelDraft.trim() && labelDraft !== session.label) {
      await updateLiveSession(id, { label: labelDraft.trim() })
      reload()
    }
    setEditingLabel(false)
  }

  async function setHost(hostId) {
    await updateLiveSession(id, { host_id: hostId })
    reload()
  }

  async function handleGoLive() {
    setError('')
    setBusy(true)
    try {
      await goLiveSession(id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mulai siaran')
    } finally {
      setBusy(false)
    }
  }

  async function handleEnd() {
    setBusy(true)
    try {
      await endLiveSession(id)
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function handleAddProduct(variantId, livePrice) {
    await addLiveSessionProduct(id, variantId, livePrice)
    reload()
  }

  async function handleRemoveProduct(cartItemId) {
    await removeLiveSessionProduct(id, cartItemId)
    reload()
  }

  if (!session) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">Memuat...</div>

  return (
    <div className="px-4 sm:px-6 py-6">
      <button onClick={() => navigate('/panel-siaran/history')} className="text-sm text-gray-500 hover:text-gray-800 mb-4">
        ← Kembali
      </button>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-gray-800">Info Sesi</p>
            <SessionStatusPill status={session.status} />
          </div>
          <p className="text-xs text-gray-500 mb-1">Nama Sesi</p>
          {editingLabel ? (
            <div className="flex items-center gap-2 mb-4">
              <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onBlur={saveLabel} autoFocus className="border border-gray-300 rounded-lg px-2 py-1 text-lg font-bold flex-1" />
            </div>
          ) : (
            <p className="text-lg font-bold text-gray-800 mb-4">
              {session.label} <button onClick={() => setEditingLabel(true)} className="text-xs font-semibold text-brand-600 hover:underline align-middle ml-1">Edit</button>
            </p>
          )}

          <p className="text-xs text-gray-500 mb-1">Host</p>
          {session.status === 'draft' ? (
            <select value={session.host_id || ''} onChange={(e) => setHost(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm mb-4 w-full">
              <option value="">Pilih host...</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : (
            <p className="text-sm font-semibold text-gray-700 mb-4">{session.host_name}</p>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Jumlah Pesanan</p>
              <p className="text-lg font-bold text-gray-800">{session.order_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Puncak Penonton</p>
              <p className="text-lg font-bold text-gray-800">{session.peak_viewers}</p>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {session.status === 'draft' && (
            <button onClick={handleGoLive} disabled={busy || !session.host_id} className="w-full bg-gray-800 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold py-2.5 rounded-full">
              📡 Mulai Siaran
            </button>
          )}
          {session.status === 'live' && (
            <button onClick={handleEnd} disabled={busy} className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold py-2.5 rounded-full">
              Akhiri Siaran
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="font-bold text-gray-800 mb-4">Konsol Siaran</p>
          {cart.length === 0 ? (
            <div className="border border-gray-200 rounded-xl py-4 text-center text-sm text-gray-400">
              Tambahkan produk ke keranjang live dulu
            </div>
          ) : (
            <p className="text-sm text-gray-600">{cart.length} produk siap ditampilkan saat live.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-800">Produk Keranjang Live ({cart.length})</h2>
        <button onClick={() => setModalOpen(true)} className="bg-gray-800 hover:bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
          <IconPlus width={14} height={14} /> Tambah Produk
        </button>
      </div>

      {cart.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-400">
          Belum ada produk di keranjang live
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {cart.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">{c.product_name}</p>
                <p className="text-xs text-gray-500">{c.color}/{c.size} · <span className="font-mono">{c.sku}</span></p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-400 line-through">{formatCurrency(c.price)}</p>
                  <p className="text-sm font-bold text-brand-600">{formatCurrency(c.live_price)}</p>
                </div>
                <button onClick={() => handleRemoveProduct(c.id)} className="text-gray-400 hover:text-red-600">
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && <AddProductModal variants={variants} onAdd={handleAddProduct} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
