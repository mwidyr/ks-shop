import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listLanguages } from '../api/languages'
import { getProduct, createProduct, updateProduct, createVariant, updateVariant, deleteVariant, addProductImage, deleteProductImage, getProductCostHistory } from '../api/products'
import { listSuppliers } from '../api/suppliers'
import { listColors } from '../api/colors'
import PhotoSlots from '../components/PhotoSlots'
import ProductWebsiteSection from '../components/website/ProductWebsiteSection'
import ImagePreviewModal from '../components/ImagePreviewModal'
import CategorySelect from '../components/CategorySelect'
import VariantSuppliersSection from '../components/VariantSuppliersSection'
import { formatCNY } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { useMasterData } from '../context/MasterDataContext'

// Case-insensitive dedup (item 075): "Red, red" used to produce two distinct variant rows that
// both resolved to the identical computed SKU (buildVariantSKU uppercases before truncating),
// colliding on every save. Keeps the first-seen casing so the displayed text isn't rewritten.
function parseList(text) {
  const seen = new Set()
  const result = []
  for (const raw of text.split(',')) {
    const s = raw.trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(s)
  }
  return result
}

// Variant SKU is PRODUCT CODE - COLOR - SIZE with the full Chinese color name from Color Master,
// e.g. C002-黑-F - the format the 3PL picks by. Same rule as buildVariantSKU in the backend, which
// always recomputes it on save (only a super_user may type one by hand); this is a live preview.
function suggestSku(productCode, variant, toChineseColor = (c) => c) {
  const part = (v) => (v || '').split(/\s+/).join('').toUpperCase()
  return [part(productCode), part(toChineseColor(variant.color)), part(variant.size)].filter(Boolean).join('-')
}

function freshVariantRow(color, size, product, toChineseColor) {
  return {
    sku: suggestSku(product.sku, { color, size }, toChineseColor), sku_manual: false, color, size,
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
  const { translateColor, toChineseColor } = useMasterData()
  // Product Cost is admin-only: the field is only ever present in the API response for
  // super_user, and the backend silently ignores it from anyone else's write - this check is
  // just what decides whether to show the input at all.
  const isAdmin = user?.role === 'super_user'

  const [product, setProduct] = useState({
    sku: '', vendor_sku: '', name: '', names: {}, description: '', category: '', brand: '', supplier_id: '',
    base_price: '', cost: '', is_active: true, allow_oversell: false,
    measurement_bust: '', measurement_waist: '', measurement_length: '', measurement_bottom_length: '',
    measurement_elasticity: '', measurement_note: '',
  })
  const [suppliers, setSuppliers] = useState([])
  const [languages, setLanguages] = useState([])
  useEffect(() => { listLanguages().then(setLanguages) }, [])
  const [images, setImages] = useState([])
  const [previewIndex, setPreviewIndex] = useState(null)
  const [colorsText, setColorsText] = useState('')
  const [sizesText, setSizesText] = useState('')
  const [colorOptions, setColorOptions] = useState([])
  const [variants, setVariants] = useState([])
  const [deletedVariantIds, setDeletedVariantIds] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [costHistory, setCostHistory] = useState([])

  useEffect(() => {
    if (isEdit && isAdmin) getProductCostHistory(id).then(setCostHistory).catch(() => {})
  }, [id, isEdit, isAdmin])

  useEffect(() => {
    if (!isEdit) return
    getProduct(id).then((p) => {
      setProduct({
        sku: p.sku, vendor_sku: p.vendor_sku, name: p.name, names: p.names || {}, description: p.description,
        category: p.category, brand: p.brand, supplier_id: p.supplier_id ?? '', base_price: p.base_price || '',
        cost: p.cost ?? '', // absent entirely in the response for non-admins - stays '' for them
        is_active: p.is_active, allow_oversell: p.allow_oversell,
        measurement_bust: p.measurement_bust || '', measurement_waist: p.measurement_waist || '',
        measurement_length: p.measurement_length || '', measurement_bottom_length: p.measurement_bottom_length || '',
        measurement_elasticity: p.measurement_elasticity || '', measurement_note: p.measurement_note || '',
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

  useEffect(() => { listSuppliers(true).then(setSuppliers) }, [])
  useEffect(() => { listColors().then(setColorOptions) }, [])

  // Appends the chosen master color's Chinese (canonical) name into the existing comma-text
  // field instead of replacing the input - keeps regenerateVariants'/parseList's Cartesian
  // generation untouched, this is purely a faster way to fill that same field.
  function addColorFromMaster(e) {
    const nameZh = e.target.value
    e.target.value = ''
    if (!nameZh) return
    const existing = parseList(colorsText)
    if (existing.includes(nameZh)) return
    const next = existing.concat(nameZh).join(', ')
    setColorsText(next)
    regenerateVariants(next)
  }

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
  // saved id) survive unchanged. Combinations no longer present are dropped, queuing the full row
  // (not just its id) for server-side deletion on save - see handleSubmit, which needs the full
  // row to fall back to deactivating instead when the variant has order history and can't
  // actually be hard-deleted (item 069).
  function regenerateVariants(overrideColorsText) {
    const colors = parseList(overrideColorsText ?? colorsText)
    const sizes = parseList(sizesText)
    const colorList = colors.length ? colors : ['']
    const sizeList = sizes.length ? sizes : ['']
    setVariants((prev) => {
      const next = []
      for (const color of colorList) {
        for (const size of sizeList) {
          const existing = prev.find((v) => v.color === color && v.size === size)
          next.push(existing || freshVariantRow(color, size, product, toChineseColor))
        }
      }
      const nextKeys = new Set(next.map((v) => `${v.color}|${v.size}`))
      const removed = prev.filter((v) => v.id && !nextKeys.has(`${v.color}|${v.size}`))
      if (removed.length) {
        setDeletedVariantIds((rows) => [...rows, ...removed])
      }
      return next
    })
  }

  function removeVariantRow(idx) {
    setVariants((vs) => {
      const removed = vs[idx]
      if (removed?.id) setDeletedVariantIds((rows) => [...rows, removed])
      return vs.filter((_, i) => i !== idx)
    })
  }

  function variantBody(v) {
    return {
      sku: v.sku, sku_manual: Boolean(v.sku_manual), color: v.color, size: v.size, price: Number(v.price) || 0,
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
      const productBody = {
        ...product,
        base_price: Number(product.base_price) || 0,
        cost: Number(product.cost) || 0,
        supplier_id: product.supplier_id === '' ? null : Number(product.supplier_id),
      }
      if (!isEdit) {
        await createProduct({
          ...productBody,
          images: images.map((img) => img.url),
          variants: variants.map(variantBody),
        })
        navigate('/products')
      } else {
        await updateProduct(id, productBody)
        // Product-level fields are already committed by this point (separate call/transaction
        // from the variant updates below) - if a variant update fails, the error shown must make
        // that clear rather than reading like nothing was saved at all (item 075).
        try {
          for (const removedVariant of deletedVariantIds) {
            try {
              await deleteVariant(id, removedVariant.id)
            } catch (err) {
              // A variant that's ever been used in an order can't be hard-deleted (FK constraint,
              // by design - see products.go DeleteVariant) - removing its color/size from the list
              // above used to just fail outright here with no way to recover (item 069). Fall back
              // to deactivating it instead, matching this form's "no permanent delete, sellable
              // toggle only" policy everywhere else.
              if (err.response?.status === 409) {
                await updateVariant(id, removedVariant.id, { ...variantBody(removedVariant), is_active: false })
              } else {
                throw err
              }
            }
          }
          for (const v of variants) {
            const body = variantBody(v)
            if (v.id) {
              await updateVariant(id, v.id, body)
            } else {
              await createVariant(id, body)
            }
          }
        } catch (err) {
          setError(`${t('page_product_form.product_saved_variant_failed_prefix')} ${err.response?.data?.error || t('page_product_form.save_failed')}`)
          setSaving(false)
          return
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
            <PhotoSlots value={images} onAdd={handleAddImage} onRemove={handleRemoveImage} onPreview={setPreviewIndex} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.product_name')}</label>
            <input
              value={product.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">{t('page_product_form.main_name_hint')}</p>
          </div>
          {languages.filter((l) => l.code !== 'id').length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.names_by_language')}</label>
              <div className="space-y-2">
                {languages.filter((l) => l.code !== 'id').map((l) => (
                  <div key={l.code} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-gray-500">{l.label}</span>
                    <input
                      value={product.names?.[l.code] || ''}
                      onChange={(e) => updateField('names', { ...product.names, [l.code]: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('page_product_form.names_by_language_hint')}</p>
            </div>
          )}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('page_product_form.category')} <span className="text-gray-400 font-normal">({t('page_product_form.optional_word')})</span>
            </label>
            <CategorySelect value={product.category} onChange={(v) => updateField('category', v)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_product_form.supplier_label')}</label>
            <select
              value={product.supplier_id}
              onChange={(e) => updateField('supplier_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">{t('page_product_form.supplier_none')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-0.5">{t('page_product_form.supplier_hint')}</p>
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
              {costHistory.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] text-gray-500 cursor-pointer">{t('page_product_form.cost_history_title', { count: costHistory.length })}</summary>
                  <ul className="mt-1 space-y-0.5">
                    {costHistory.map((c, i) => (
                      <li key={i} className="text-[11px] text-gray-500">
                        {formatCNY(c.old_cost)} → {formatCNY(c.new_cost)} · {c.po_number || t(`page_product_form.cost_source_${c.source}`)} · {c.changed_by} · {new Date(c.changed_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
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

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">{t('page_product_form.measurements_heading')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_bust')}</label>
              <input value={product.measurement_bust} onChange={(e) => updateField('measurement_bust', e.target.value)} placeholder={t('page_product_form.measurement_placeholder')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_waist')}</label>
              <input value={product.measurement_waist} onChange={(e) => updateField('measurement_waist', e.target.value)} placeholder={t('page_product_form.measurement_placeholder')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_length')}</label>
              <input value={product.measurement_length} onChange={(e) => updateField('measurement_length', e.target.value)} placeholder={t('page_product_form.measurement_placeholder')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_bottom_length')}</label>
              <input value={product.measurement_bottom_length} onChange={(e) => updateField('measurement_bottom_length', e.target.value)} placeholder={t('page_product_form.measurement_placeholder')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_elasticity')}</label>
              <input value={product.measurement_elasticity} onChange={(e) => updateField('measurement_elasticity', e.target.value)} placeholder={t('page_product_form.measurement_placeholder')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.measurement_note')}</label>
            <textarea value={product.measurement_note} onChange={(e) => updateField('measurement_note', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">{t('page_product_form.variants_heading')}</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.colors_label')}</label>
              {/* Stacked, not side-by-side: a flex row here overflowed into the Ukuran column
                  next to it, since the master-color <select>'s placeholder text doesn't shrink
                  below its own content width. Stacking is overflow-proof at any column width. */}
              <div className="space-y-1.5">
                <input
                  value={colorsText}
                  onChange={(e) => setColorsText(e.target.value)}
                  onBlur={() => regenerateVariants()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); regenerateVariants() } }}
                  placeholder={t('page_product_form.colors_placeholder')}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                {colorOptions.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={addColorFromMaster}
                    title={t('page_product_form.add_color_from_master')}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-500"
                  >
                    <option value="">{t('page_product_form.add_color_from_master')}</option>
                    {colorOptions.map((c) => <option key={c.id} value={c.name_zh}>{translateColor(c.name_zh)}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.sizes_label')}</label>
              <input
                value={sizesText}
                onChange={(e) => setSizesText(e.target.value)}
                onBlur={() => regenerateVariants()}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); regenerateVariants() } }}
                placeholder={t('page_product_form.sizes_placeholder')}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="space-y-4">
            {variants.map((v, idx) => (
              <div key={`${v.color}|${v.size}`} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-700 whitespace-nowrap shrink-0">
                      {v.color ? translateColor(v.color) : t('page_product_form.variant_no_color_label')}{v.size ? ` / ${v.size}` : ''}
                    </p>
                    {/* SKU is computed (PRODUCT CODE - Chinese COLOR - SIZE, a 1-digit suffix on a
                        collision). Only a super_user may type one by hand - it is then marked manual
                        and never recomputed; clearing the field goes back to automatic. */}
                    <input
                      type="text"
                      value={v.sku}
                      readOnly={!isAdmin}
                      onChange={(e) => setVariants((vs) => vs.map((x, i) => (i === idx ? { ...x, sku: e.target.value, sku_manual: e.target.value.trim() !== '' } : x)))}
                      onBlur={() => { if (!v.sku.trim()) setVariants((vs) => vs.map((x, i) => (i === idx ? { ...x, sku: suggestSku(product.sku, x, toChineseColor), sku_manual: false } : x))) }}
                      title={t(isAdmin ? 'page_product_form.variant_sku_hint' : 'page_product_form.variant_sku_auto_hint')}
                      className={`flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-600 ${isAdmin ? '' : 'bg-gray-50'}`}
                    />
                    {v.sku_manual && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">{t('page_product_form.variant_sku_manual')}</span>}
                  </div>
                  {!isEdit && variants.length > 1 && (
                    <button type="button" onClick={() => removeVariantRow(idx)} className="text-xs text-red-600 hover:underline shrink-0">
                      {t('page_product_form.remove_variant')}
                    </button>
                  )}
                </div>

                <div className={`grid grid-cols-2 ${isEdit ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-3`}>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.sell_price_placeholder')}</label>
                    <input type="number" value={v.price} onChange={(e) => updateVariantField(idx, 'price', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" required />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.compare_at_price_placeholder')}</label>
                    <input
                      type="number" min="0" value={v.compare_at_price || ''}
                      onChange={(e) => updateVariantField(idx, 'compare_at_price', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    />
                  </div>
                  {!isEdit && (
                    <>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.available_label')}</label>
                        <input
                          type="number" min="0" value={v.available_stock}
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
                    </>
                  )}
                  {isEdit && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">{t('page_product_form.total_stock_label')}</label>
                      <input type="text" value={(Number(v.available_stock) || 0) + (Number(v.incoming_stock) || 0) - (v.reserved_for_orders || 0)} disabled className="border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-sm w-full text-gray-500" />
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
      {isEdit && <VariantSuppliersSection productId={id} variants={variants} suppliers={suppliers} />}
      {isEdit && <ProductWebsiteSection productId={id} />}
      {previewIndex !== null && <ImagePreviewModal images={images} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />}
    </div>
  )
}
