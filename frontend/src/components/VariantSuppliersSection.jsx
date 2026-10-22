import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listVariantSuppliers, saveVariantSuppliers } from '../api/products'
import { useMasterData } from '../context/MasterDataContext'

// Multi-supplier support (#125): each saved variant (SKU) can be linked to several suppliers -
// supplier product code, 1688 URL, reference price + currency, active flag, one preferred. The
// preferred supplier is picked by default on a Purchase Requisition and its reference price
// defaults the unit cost. Saved on its own (replaces all links of this product), never creates a
// new SKU.
function emptyLink(variantId) {
  return { variant_id: variantId, supplier_id: '', supplier_product_code: '', url_1688: '', ref_price: '', currency: 'RMB', is_active: true, is_preferred: false }
}

export default function VariantSuppliersSection({ productId, variants, suppliers }) {
  const { t } = useTranslation()
  const { translateColor } = useMasterData()
  const [links, setLinks] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listVariantSuppliers(productId).then((rows) => setLinks(rows.map((l) => ({ ...l, ref_price: l.ref_price ?? '' }))))
  }, [productId])

  if (!links) return null
  const saved = variants.filter((v) => v.id)
  if (saved.length === 0) return null

  const update = (idx, field, value) => setLinks((ls) => ls.map((l, i) => {
    if (i !== idx) return field === 'is_preferred' && value && l.variant_id === ls[idx].variant_id ? { ...l, is_preferred: false } : l
    return { ...l, [field]: value, ...(field === 'is_active' && !value ? { is_preferred: false } : {}) }
  }))
  const add = (variantId) => setLinks((ls) => [...ls, { ...emptyLink(variantId), is_preferred: !ls.some((l) => l.variant_id === variantId) }])
  const remove = (idx) => setLinks((ls) => ls.filter((_, i) => i !== idx))
  // Copies the first variant's suppliers onto every other variant (most products buy every
  // color/size from the same suppliers).
  const copyToAll = (variantId) => setLinks((ls) => {
    const source = ls.filter((l) => l.variant_id === variantId)
    return [...source, ...saved.filter((v) => v.id !== variantId).flatMap((v) => source.map((l) => ({ ...l, id: undefined, variant_id: v.id })))]
  })

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveVariantSuppliers(productId, links.filter((l) => l.supplier_id !== '').map((l) => ({
        variant_id: l.variant_id, supplier_id: Number(l.supplier_id), supplier_product_code: l.supplier_product_code || '',
        url_1688: l.url_1688 || '', ref_price: l.ref_price === '' ? null : Number(l.ref_price), currency: l.currency || 'RMB',
        is_active: l.is_active !== false, is_preferred: Boolean(l.is_preferred),
      })))
      setMessage(t('page_product_form.vs_saved'))
    } catch (err) {
      setError(err.response?.data?.error || t('page_product_form.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const input = 'border border-gray-300 rounded-lg px-2 py-1 text-sm w-full'
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 mt-6 space-y-4">
      <div>
        <h2 className="font-bold text-gray-800">{t('page_product_form.vs_heading')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('page_product_form.vs_hint')}</p>
      </div>
      {saved.map((v, vIdx) => {
        const rows = links.map((l, idx) => ({ l, idx })).filter(({ l }) => l.variant_id === v.id)
        return (
          <div key={v.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-700">
                {v.color ? translateColor(v.color) : t('page_product_form.variant_no_color_label')}{v.size ? ` / ${v.size}` : ''}
                <span className="ml-2 font-mono text-xs text-gray-400">{v.sku}</span>
              </p>
              <div className="flex gap-3 text-xs">
                {vIdx === 0 && saved.length > 1 && rows.length > 0 && (
                  <button type="button" onClick={() => copyToAll(v.id)} className="text-gray-500 hover:text-brand-600">{t('page_product_form.vs_copy_to_all')}</button>
                )}
                <button type="button" onClick={() => add(v.id)} className="font-semibold text-brand-600 hover:underline">+ {t('page_product_form.vs_add')}</button>
              </div>
            </div>
            {rows.length === 0 && <p className="text-xs text-gray-400">{t('page_product_form.vs_none')}</p>}
            {rows.map(({ l, idx }) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border-t border-gray-100 pt-2">
                <div className="col-span-2">
                  <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_product_form.supplier_label')}</label>
                  <select value={l.supplier_id} onChange={(e) => update(idx, 'supplier_id', e.target.value)} className={input}>
                    <option value="">{t('page_product_form.supplier_none')}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_product_form.vs_code')}</label>
                  <input value={l.supplier_product_code} onChange={(e) => update(idx, 'supplier_product_code', e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_product_form.vs_ref_price')}</label>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="0.01" value={l.ref_price} onChange={(e) => update(idx, 'ref_price', e.target.value)} className={input} />
                    <select value={l.currency} onChange={(e) => update(idx, 'currency', e.target.value)} className="border border-gray-300 rounded-lg px-1 py-1 text-xs">
                      <option value="RMB">RMB</option>
                      <option value="TWD">TWD</option>
                    </select>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_product_form.vs_url')}</label>
                  <input value={l.url_1688} onChange={(e) => update(idx, 'url_1688', e.target.value)} placeholder="https://detail.1688.com/..." className={input} />
                </div>
                <div className="col-span-2 sm:col-span-6 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name={`preferred-${v.id}`} checked={Boolean(l.is_preferred)} disabled={l.is_active === false} onChange={() => update(idx, 'is_preferred', true)} />
                    {t('page_product_form.vs_preferred')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={l.is_active !== false} onChange={(e) => update(idx, 'is_active', e.target.checked)} />
                    {t('page_product_form.vs_active')}
                  </label>
                  {l.url_1688 && <a href={l.url_1688} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{t('page_product_form.vs_open_url')}</a>}
                  <button type="button" onClick={() => remove(idx)} className="ml-auto text-red-600 hover:underline">{t('page_product_form.vs_remove')}</button>
                </div>
              </div>
            ))}
          </div>
        )
      })}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && <p className="text-green-600 text-sm">{message}</p>}
      <button type="button" onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60">
        {saving ? t('page_product_form.saving') : t('page_product_form.vs_save')}
      </button>
    </div>
  )
}
