import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrder } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listCouriers } from '../api/couriers'
import { listProducts } from '../api/products'
import { formatRupiah } from '../utils/format'
import CustomerPicker from '../components/CustomerPicker'

const emptyLine = () => ({ hostId: '', productId: '', variantId: '', qty: 1 })

export default function OrderCreate() {
  const navigate = useNavigate()
  const [hosts, setHosts] = useState([])
  const [couriers, setCouriers] = useState([])
  const [products, setProducts] = useState([])
  const [lines, setLines] = useState([emptyLine()])
  const [customer, setCustomer] = useState(null)
  const [shippingAddress, setShippingAddress] = useState('')
  const [courierId, setCourierId] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')
  const [additionalAmount, setAdditionalAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listHosts().then(setHosts)
    listCouriers().then(setCouriers)
    listProducts().then(setProducts)
  }, [])

  function updateLine(idx, field, value) {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [field]: value }
      if (field === 'productId') next.variantId = ''
      return next
    }))
  }

  function addLine() {
    setLines((ls) => [...ls, emptyLine()])
  }

  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx))
  }

  function variantsFor(productId) {
    const p = products.find((p) => String(p.id) === String(productId))
    return p ? p.variants : []
  }

  function variantPrice(productId, variantId) {
    const v = variantsFor(productId).find((v) => String(v.id) === String(variantId))
    return v ? v.price : 0
  }

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + variantPrice(l.productId, l.variantId) * (Number(l.qty) || 0), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, products])
  const total = Math.max(0, subtotal - (Number(discountAmount) || 0) + (Number(additionalAmount) || 0))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!customer) {
      setError('Pilih atau tambahkan pelanggan terlebih dahulu')
      return
    }
    if (!courierId) {
      setError('Pilih kurir pengiriman')
      return
    }
    if (!shippingAddress) {
      setError('Alamat pengiriman wajib diisi')
      return
    }
    const items = lines.map((l) => ({ host_id: Number(l.hostId), variant_id: Number(l.variantId), qty: Number(l.qty) }))
    if (items.some((it) => !it.host_id || !it.variant_id || !it.qty)) {
      setError('Setiap baris harus memiliki host, produk/varian, dan qty yang valid')
      return
    }

    setSaving(true)
    try {
      const res = await createOrder({
        customer,
        shipping_address: shippingAddress,
        shipping_courier_id: Number(courierId),
        items,
        discount_amount: Number(discountAmount) || 0,
        additional_amount: Number(additionalAmount) || 0,
      })
      navigate(`/orders/${res.order_id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal membuat order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Pelanggan</h2>
          <CustomerPicker onChange={setCustomer} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Produk & Host</h2>
            <button type="button" onClick={addLine} className="text-sm font-semibold text-brand-600 hover:underline">
              + Tambah Baris
            </button>
          </div>
          <div className="space-y-3">
            {lines.map((l, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] text-gray-500 mb-1">Host Live</label>
                  <select value={l.hostId} onChange={(e) => updateLine(idx, 'hostId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">Pilih host</option>
                    {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] text-gray-500 mb-1">Produk</label>
                  <select value={l.productId} onChange={(e) => updateLine(idx, 'productId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">Pilih produk</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Varian / SKU</label>
                  <select value={l.variantId} onChange={(e) => updateLine(idx, 'variantId', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required>
                    <option value="">Pilih varian</option>
                    {variantsFor(l.productId).map((v) => (
                      <option key={v.id} value={v.id}>{v.sku} · {v.color}/{v.size} ({v.available_stock} tersedia)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Qty</label>
                  <input type="number" min="1" value={l.qty} onChange={(e) => updateLine(idx, 'qty', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{formatRupiah(variantPrice(l.productId, l.variantId) * (Number(l.qty) || 0))}</span>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="text-xs text-red-600 hover:underline ml-2">Hapus</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Pengiriman</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kurir</label>
            <select value={courierId} onChange={(e) => setCourierId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
              <option value="">Pilih kurir</option>
              {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Pengiriman</label>
            <textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diskon</label>
              <input type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Biaya Tambahan</label>
              <input type="number" min="0" value={additionalAmount} onChange={(e) => setAdditionalAmount(e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            {Number(discountAmount) > 0 && (
              <div className="flex items-center justify-between text-red-600">
                <span>Diskon</span>
                <span>-{formatRupiah(Number(discountAmount))}</span>
              </div>
            )}
            {Number(additionalAmount) > 0 && (
              <div className="flex items-center justify-between text-gray-500">
                <span>Biaya Tambahan</span>
                <span>+{formatRupiah(Number(additionalAmount))}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-gray-800">Total</span>
              <span className="text-xl font-extrabold text-brand-600">{formatRupiah(total)}</span>
            </div>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Buat Pesanan'}
          </button>
          <button type="button" onClick={() => navigate('/orders')} className="text-gray-500 px-5 py-2.5">
            Batal
          </button>
        </div>
      </form>
    </div>
  )
}
