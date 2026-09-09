import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProduct, createProduct, updateProduct, createVariant, updateVariant, addProductImage, deleteProductImage } from '../api/products'
import PhotoSlots from '../components/PhotoSlots'
import CategorySelect from '../components/CategorySelect'

const emptyVariant = () => ({
  sku: '', color: '', size: '', price: '', compare_at_price: '', cost_price: '',
  available_stock: 0, broken_stock: 0, reserve_stock: 0, incoming_stock: 0, minimum_stock: 0,
})

function suggestSku(productName, variant) {
  const initials = productName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SKU'
  const colorPart = (variant.color || '').slice(0, 3).toUpperCase()
  const sizePart = (variant.size || '').toUpperCase()
  return [initials, colorPart, sizePart].filter(Boolean).join('-')
}

export default function ProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [product, setProduct] = useState({ name: '', description: '', category: '', brand: '' })
  const [images, setImages] = useState([])
  const [variants, setVariants] = useState([emptyVariant()])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    getProduct(id).then((p) => {
      setProduct({ name: p.name, description: p.description, category: p.category, brand: p.brand })
      setImages(p.images)
      setVariants(p.variants.map((v) => ({ ...v })))
      setLoading(false)
    })
  }, [id, isEdit])

  async function handleAddImage(url) {
    if (!isEdit) {
      setImages((imgs) => [...imgs, { url }])
      return
    }
    const res = await addProductImage(id, url)
    setImages((imgs) => [...imgs, { id: res.id, url }])
  }

  async function handleRemoveImage(image, idx) {
    if (isEdit && image.id) {
      await deleteProductImage(id, image.id)
    }
    setImages((imgs) => imgs.filter((_, i) => i !== idx))
  }

  function updateField(field, value) {
    setProduct((p) => ({ ...p, [field]: value }))
  }

  function updateVariantField(idx, field, value) {
    setVariants((vs) => vs.map((v, i) => (i === idx ? { ...v, [field]: value } : v)))
  }

  function autoSku(idx) {
    setVariants((vs) => vs.map((v, i) => (i === idx ? { ...v, sku: suggestSku(product.name || 'Produk', v) } : v)))
  }

  function addVariant() {
    setVariants((vs) => [...vs, emptyVariant()])
  }

  function removeVariant(idx) {
    setVariants((vs) => vs.filter((_, i) => i !== idx))
  }

  function totalStock(v) {
    return (Number(v.available_stock) || 0) + (Number(v.reserve_stock) || 0) + (Number(v.broken_stock) || 0)
  }

  function variantBody(v) {
    return {
      sku: v.sku, color: v.color, size: v.size, price: Number(v.price),
      compare_at_price: Number(v.compare_at_price) || 0, cost_price: Number(v.cost_price) || 0,
      available_stock: Number(v.available_stock), broken_stock: Number(v.broken_stock), reserve_stock: Number(v.reserve_stock),
      incoming_stock: Number(v.incoming_stock) || 0, minimum_stock: Number(v.minimum_stock) || 0,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (images.length === 0) {
      setError('Foto Utama wajib diisi')
      return
    }
    setSaving(true)
    try {
      if (!isEdit) {
        await createProduct({
          ...product,
          images: images.map((img) => img.url),
          variants: variants.map(variantBody),
        })
        navigate('/products')
      } else {
        await updateProduct(id, product)
        for (const v of variants) {
          const body = variantBody(v)
          if (v.id) {
            await updateVariant(id, v.id, body)
          } else {
            await createVariant(id, body)
          }
        }
        navigate('/products')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menyimpan produk')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Memuat...</div>

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Foto Produk</label>
            <PhotoSlots value={images} onAdd={handleAddImage} onRemove={handleRemoveImage} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
            <input
              value={product.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <CategorySelect value={product.category} onChange={(v) => updateField('category', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input
                value={product.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                placeholder="Opsional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea
              value={product.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Varian</h2>
            <button type="button" onClick={addVariant} className="text-sm font-semibold text-brand-600 hover:underline">
              + Tambah Varian
            </button>
          </div>
          <div className="space-y-4">
            {variants.map((v, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex gap-1">
                    <input placeholder="SKU" value={v.sku} onChange={(e) => updateVariantField(idx, 'sku', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0" required />
                    <button type="button" onClick={() => autoSku(idx)} title="Buat SKU otomatis" className="text-[11px] px-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 shrink-0">
                      Auto
                    </button>
                  </div>
                  <input placeholder="Warna" value={v.color} onChange={(e) => updateVariantField(idx, 'color', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input placeholder="Ukuran" value={v.size} onChange={(e) => updateVariantField(idx, 'size', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input placeholder="Harga Jual" type="number" value={v.price} onChange={(e) => updateVariantField(idx, 'price', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" required />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Compare-at Price</label>
                    <input type="number" value={v.compare_at_price} onChange={(e) => updateVariantField(idx, 'compare_at_price', e.target.value)} placeholder="0" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Cost Price</label>
                    <input type="number" value={v.cost_price} onChange={(e) => updateVariantField(idx, 'cost_price', e.target.value)} placeholder="0" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Available</label>
                    <input type="number" value={v.available_stock} onChange={(e) => updateVariantField(idx, 'available_stock', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Reserve</label>
                    <input type="number" value={v.reserve_stock} onChange={(e) => updateVariantField(idx, 'reserve_stock', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Broken</label>
                    <input type="number" value={v.broken_stock} onChange={(e) => updateVariantField(idx, 'broken_stock', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Incoming</label>
                    <input type="number" value={v.incoming_stock} onChange={(e) => updateVariantField(idx, 'incoming_stock', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Min. Stock</label>
                    <input type="number" value={v.minimum_stock} onChange={(e) => updateVariantField(idx, 'minimum_stock', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Total Stock</label>
                    <input type="text" value={totalStock(v)} disabled className="border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-sm w-full text-gray-500" />
                  </div>
                </div>
                {variants.length > 1 && (
                  <button type="button" onClick={() => removeVariant(idx)} className="text-xs text-red-600 hover:underline">
                    Hapus varian ini
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button type="button" onClick={() => navigate('/products')} className="text-gray-500 px-5 py-2.5">
            Batal
          </button>
        </div>
      </form>
    </div>
  )
}
