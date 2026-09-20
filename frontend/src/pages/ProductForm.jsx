import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProduct, createProduct, updateProduct, createVariant, updateVariant, deleteVariant, addProductImage, deleteProductImage } from '../api/products'
import PhotoSlots from '../components/PhotoSlots'
import CategorySelect from '../components/CategorySelect'
import { useAuth } from '../context/AuthContext'

function parseList(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function suggestSku(productName, variant) {
  const initials = productName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SKU'
  const colorPart = (variant.color || '').slice(0, 3).toUpperCase()
  const sizePart = (variant.size || '').toUpperCase()
  return [initials, colorPart, sizePart].filter(Boolean).join('-')
}

function freshVariantRow(color, size, product) {
  return {
    sku: suggestSku(product.name || 'Produk', { color, size }), color, size,
    price: product.base_price || '', compare_at_price: 0, cost_price: 0,
    allow_oversell: product.allow_oversell, is_active: true,
    available_stock: 0, broken_stock: 0, reserve_stock: 0, incoming_stock: 0, minimum_stock: 0,
    order_stock: 0,
  }
}

export default function ProductForm() {
  const { t } = useTranslation()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  // Product Cost is admin-only: the field is only ever present in the API response for
  // super_user, and the backend silently ignores it from anyone else's write - this check is
  // just what decides whether to show the input at all.
  const isAdmin = user?.role === 'super_user'

  const [product, setProduct] = useState({
    sku: '', vendor_sku: '', name: '', description: '', category: '', brand: '',
    base_price: '', cost: '', is_active: true, allow_oversell: false,
  })
  const [images, setImages] = useState([])
  const [colorsText, setColorsText] = useState('')
  const [sizesText, setSizesText] = useState('')
  const [variants, setVariants] = useState([])
  const [deletedVariantIds, setDeletedVariantIds] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    getProduct(id).then((p) => {
      setProduct({
        sku: p.sku, vendor_sku: p.vendor_sku, name: p.name, description: p.description,
        category: p.category, brand: p.brand, base_price: p.base_price || '',
        cost: p.cost ?? '', // absent entirely in the response for non-admins - stays '' for them
        is_active: p.is_active, allow_oversell: p.allow_oversell,
      })
      setImages(p.images)
      setVariants(p.variants.map((v) => ({ ...v })))
      setColorsText([...new Set(p.variants.map((v) => v.color).filter(Boolean))].join(', '))
      setSizesText([...new Set(p.variants.map((v) => v.size).filter(Boolean))].join(', '))
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit])

  // The variant section only "forms" once name, product code and base price are all filled in -
  // at that point a single default variant (one color, one size) is created automatically.
  useEffect(() => {
    if (isEdit || variants.length > 0) return
    if (product.name && product.sku && product.base_price) {
      regenerateVariants()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, variants.length, product.name, product.sku, product.base_price])

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

  // Regenerates the variant list as the color x size Cartesian product, reconciling against the
  // current list by exact (color, size) match so existing rows (sku/price/stock/oversell, and any
  // saved id) survive unchanged. Combinations no longer present are dropped, queuing their id (if
  // any) for server-side deletion on save.
  function regenerateVariants() {
    const colors = parseList(colorsText)
    const sizes = parseList(sizesText)
    const colorList = colors.length ? colors : ['']
    const sizeList = sizes.length ? sizes : ['']
    setVariants((prev) => {
      const next = []
      for (const color of colorList) {
        for (const size of sizeList) {
          const existing = prev.find((v) => v.color === color && v.size === size)
          next.push(existing || freshVariantRow(color, size, product))
        }
      }
      const nextKeys = new Set(next.map((v) => `${v.color}|${v.size}`))
      const removed = prev.filter((v) => v.id && !nextKeys.has(`${v.color}|${v.size}`))
      if (removed.length) {
        setDeletedVariantIds((ids) => [...ids, ...removed.map((v) => v.id)])
      }
      return next
    })
  }

  function removeVariantRow(idx) {
    setVariants((vs) => {
      const removed = vs[idx]
      if (removed?.id) setDeletedVariantIds((ids) => [...ids, removed.id])
      return vs.filter((_, i) => i !== idx)
    })
  }

  function variantBody(v) {
    return {
      sku: v.sku, color: v.color, size: v.size, price: Number(v.price) || 0,
      compare_at_price: Number(v.compare_at_price) || 0, cost_price: Number(v.cost_price) || 0,
      allow_oversell: Boolean(v.allow_oversell), is_active: v.is_active !== false,
      available_stock: Number(v.available_stock) || 0, broken_stock: Number(v.broken_stock) || 0,
      reserve_stock: Number(v.reserve_stock) || 0, incoming_stock: Number(v.incoming_stock) || 0,
      minimum_stock: Number(v.minimum_stock) || 0,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (images.length === 0) {
      setError(t('page_product_form.main_photo_required'))
      return
    }
    if (variants.length === 0) {
      setError(t('page_product_form.variant_required'))
      return
    }
    if (isEdit) {
      for (const v of variants) {
        if (v.id && Number(v.available_stock) < (v.order_stock || 0)) {
          setError(t('page_product_form.available_below_order_error', { name: v.sku || `${v.color}/${v.size}`, order_stock: v.order_stock }))
          return
        }
      }
    }
    setSaving(true)
    try {
      const productBody = { ...product, base_price: Number(product.base_price) || 0, cost: Number(product.cost) || 0 }
      if (!isEdit) {
        await createProduct({
          ...productBody,
          images: images.map((img) => img.url),
          variants: variants.map(variantBody),
        })
        navigate('/products')
      } else {
        await updateProduct(id, productBody)
        for (const variantId of deletedVariantIds) {
          await deleteVariant(id, variantId)
        }
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
      setError(err.response?.data?.error || t('page_product_form.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('page_product_form.product_photos')}</label>
            <PhotoSlots value={images} onAdd={handleAddImage} onRemove={handleRemoveImage} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.product_name')}</label>
            <input
              value={product.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.product_sku')}</label>
            <input
              value={product.sku}
              onChange={(e) => updateField('sku', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.vendor_sku')}</label>
            <input
              value={product.vendor_sku}
              onChange={(e) => updateField('vendor_sku', e.target.value)}
              placeholder={t('page_product_form.optional_placeholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('page_product_form.category')} <span className="text-gray-400 font-normal">({t('page_product_form.optional_word')})</span>
              </label>
              <CategorySelect value={product.category} onChange={(v) => updateField('category', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.brand')}</label>
              <input
                value={product.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                placeholder={t('page_product_form.optional_placeholder')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.base_price_label')}</label>
            <input
              type="number" value={product.base_price} onChange={(e) => updateField('base_price', e.target.value)}
              placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">{t('page_product_form.base_price_hint')}</p>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.cost_label')}</label>
              <input
                type="number" value={product.cost} onChange={(e) => updateField('cost', e.target.value)}
                placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">{t('page_product_form.cost_hint')}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.description')}</label>
            <textarea
              value={product.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-start gap-2 border border-gray-200 rounded-lg p-3">
            <input type="checkbox" checked={product.is_active} onChange={(e) => updateField('is_active', e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold text-gray-700">{t('page_product_form.is_active_label')}</span>
              <span className="block text-xs text-gray-500">{t('page_product_form.is_active_hint')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 border border-gray-200 rounded-lg p-3">
            <input type="checkbox" checked={product.allow_oversell} onChange={(e) => updateField('allow_oversell', e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-semibold text-gray-700">{t('page_product_form.allow_oversell')}</span>
              <span className="block text-xs text-gray-500">{t('page_product_form.allow_oversell_hint')}</span>
            </span>
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">{t('page_product_form.variants_heading')}</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.colors_label')}</label>
              <input
                value={colorsText}
                onChange={(e) => setColorsText(e.target.value)}
                onBlur={regenerateVariants}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); regenerateVariants() } }}
                placeholder={t('page_product_form.colors_placeholder')}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.sizes_label')}</label>
              <input
                value={sizesText}
                onChange={(e) => setSizesText(e.target.value)}
                onBlur={regenerateVariants}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); regenerateVariants() } }}
                placeholder={t('page_product_form.sizes_placeholder')}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="space-y-4">
            {variants.map((v, idx) => (
              <div key={`${v.color}|${v.size}`} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    {v.color || t('page_product_form.variant_no_color_label')}{v.size ? ` / ${v.size}` : ''}
                  </p>
                  {variants.length > 1 && (
                    <button type="button" onClick={() => removeVariantRow(idx)} className="text-xs text-red-600 hover:underline">
                      {t('page_product_form.remove_variant')}
                    </button>
                  )}
                </div>
                <div className={`grid grid-cols-2 ${isEdit ? 'sm:grid-cols-6' : 'sm:grid-cols-5'} gap-3`}>
                  <input placeholder="SKU" value={v.sku} onChange={(e) => updateVariantField(idx, 'sku', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" required />
                  <input placeholder={t('page_product_form.sell_price_placeholder')} type="number" value={v.price} onChange={(e) => updateVariantField(idx, 'price', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" required />
                  <div>
                    <input
                      placeholder={t('page_product_form.compare_at_price_placeholder')} type="number" min="0" value={v.compare_at_price || ''}
                      onChange={(e) => updateVariantField(idx, 'compare_at_price', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.available_label')}</label>
                    <input
                      type="number" min={isEdit ? v.order_stock : 0} value={v.available_stock}
                      onChange={(e) => updateVariantField(idx, 'available_stock', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.incoming_label')}</label>
                    <input
                      type="number" min="0" value={v.incoming_stock}
                      onChange={(e) => updateVariantField(idx, 'incoming_stock', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    />
                  </div>
                  {isEdit && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.total_stock_label')}</label>
                      <input type="text" value={(Number(v.available_stock) || 0) + (Number(v.incoming_stock) || 0) - (v.order_stock || 0)} disabled className="border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-sm w-full text-gray-500" />
                    </div>
                  )}
                </div>
                {Number(v.compare_at_price) > 0 && (
                  Number(v.compare_at_price) > Number(v.price) ? (
                    <p className="text-[11px] text-green-600 font-medium">
                      {t('page_product_form.discount_preview', { percent: Math.round((1 - Number(v.price) / Number(v.compare_at_price)) * 100) })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-600">{t('page_product_form.compare_at_price_hint')}</p>
                  )
                )}
                {isEdit && (
                  <p className="text-[11px] text-gray-400">{t('page_product_form.order_stock_note', { order_stock: v.order_stock || 0 })}</p>
                )}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={v.allow_oversell} onChange={(e) => updateVariantField(idx, 'allow_oversell', e.target.checked)} />
                    {t('page_product_form.variant_allow_oversell')}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={v.is_active !== false} onChange={(e) => updateVariantField(idx, 'is_active', e.target.checked)} />
                    {t('page_product_form.variant_is_active')}
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? t('page_product_form.saving') : t('common.save')}
          </button>
          <button type="button" onClick={() => navigate('/products')} className="text-gray-500 px-5 py-2.5">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
