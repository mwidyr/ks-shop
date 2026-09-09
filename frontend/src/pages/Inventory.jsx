import { useEffect, useState } from 'react'
import { listProducts, updateVariant } from '../api/products'
import BigStatCard from '../components/BigStatCard'

function VariantRow({ product, variant, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(variant)
  const [saving, setSaving] = useState(false)
  const lowStock = variant.minimum_stock > 0 && variant.available_stock <= variant.minimum_stock

  async function save() {
    setSaving(true)
    try {
      await updateVariant(product.id, variant.id, {
        sku: variant.sku, color: variant.color, size: variant.size, price: variant.price,
        compare_at_price: variant.compare_at_price, cost_price: variant.cost_price,
        available_stock: Number(form.available_stock), broken_stock: Number(form.broken_stock),
        reserve_stock: Number(form.reserve_stock), incoming_stock: Number(form.incoming_stock),
        minimum_stock: Number(form.minimum_stock),
      })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className={`hover:bg-gray-50 ${lowStock ? 'bg-red-50/50' : ''}`}>
      <td className="p-3">
        <p className="font-medium text-gray-800">{product.name}</p>
        <p className="text-xs text-gray-500">{variant.sku} · {variant.color}/{variant.size}</p>
      </td>
      {['available_stock', 'reserve_stock', 'broken_stock', 'incoming_stock', 'minimum_stock'].map((field) => (
        <td key={field} className="p-3 text-center">
          {editing ? (
            <input
              type="number" value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
            />
          ) : (
            <span className={field === 'available_stock' && lowStock ? 'text-red-600 font-bold' : ''}>{variant[field]}</span>
          )}
        </td>
      ))}
      <td className="p-3 text-center font-semibold">{variant.total_stock}</td>
      <td className="p-3 text-center">
        {lowStock && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Low Stock</span>}
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end">
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:underline">Simpan</button>
            <button onClick={() => { setEditing(false); setForm(variant) }} className="text-xs text-gray-500 hover:underline">Batal</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600 hover:underline">Edit</button>
        )}
      </td>
    </tr>
  )
}

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  function reload() {
    listProducts().then((data) => {
      setProducts(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })))
  const lowStockCount = allVariants.filter(({ variant }) => variant.minimum_stock > 0 && variant.available_stock <= variant.minimum_stock).length
  const totalAvailable = allVariants.reduce((sum, { variant }) => sum + variant.available_stock, 0)
  const totalIncoming = allVariants.reduce((sum, { variant }) => sum + variant.incoming_stock, 0)

  const filtered = allVariants.filter(({ product, variant }) => {
    if (!search) return true
    const q = search.toLowerCase()
    return product.name.toLowerCase().includes(q) || variant.sku.toLowerCase().includes(q)
  })

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex flex-wrap gap-4 mb-6">
        <BigStatCard title="Total Available Stock" value={totalAvailable} iconBg="bg-green-50" iconColor="text-green-600" icon="📦" />
        <BigStatCard title="Total Incoming" value={totalIncoming} iconBg="bg-blue-50" iconColor="text-blue-600" icon="🚚" />
        <BigStatCard title="Low Stock Alert" value={lowStockCount} iconBg="bg-red-50" iconColor="text-red-600" icon="⚠️" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama produk atau SKU"
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat inventory...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">Produk / SKU</th>
                <th className="p-3 text-center">Available</th>
                <th className="p-3 text-center">Reserved</th>
                <th className="p-3 text-center">Damaged</th>
                <th className="p-3 text-center">Incoming</th>
                <th className="p-3 text-center">Min. Stock</th>
                <th className="p-3 text-center">Total</th>
                <th className="p-3 text-center">Alert</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(({ product, variant }) => (
                <VariantRow key={variant.id} product={product} variant={variant} onSaved={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
