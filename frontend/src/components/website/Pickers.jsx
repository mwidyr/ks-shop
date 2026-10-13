import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProducts } from '../../api/products'

let cache = null
// All products once per page load (the pickers filter on the client).
export function useProductList() {
  const [list, setList] = useState(cache || [])
  useEffect(() => {
    if (cache) return
    listProducts().then((l) => { cache = l; setList(l) }).catch(() => {})
  }, [])
  return list
}

export const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
export const cardCls = 'bg-white rounded-2xl shadow-sm p-5'
export const btnCls = 'bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm'
export const btnGhost = 'border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-3 py-1.5 rounded-lg text-xs'

// Search a product by name / SKU and pick it (calls onPick(product)).
export function ProductSearch({ onPick, placeholder }) {
  const { t } = useTranslation()
  const products = useProductList()
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return products.filter((p) => p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || String(p.id) === s).slice(0, 8)
  }, [q, products])
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || t('page_website.hosts.search_product')} className={inputCls} />
      {matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setQ('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                <span className="font-medium">{p.name}</span> <span className="text-gray-400 text-xs">#{p.id} {p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Product + variant picker for outfit items: picks a product, then a variant of it (onPick(variant, product)).
export function VariantPicker({ onPick }) {
  const { t } = useTranslation()
  const [product, setProduct] = useState(null)
  if (!product) return <ProductSearch onPick={setProduct} placeholder={t('page_website.hosts.pick_product')} />
  return (
    <div className="flex gap-2 items-center">
      <span className="text-sm font-medium truncate">{product.name}</span>
      <select defaultValue="" onChange={(e) => { const v = product.variants.find((x) => String(x.id) === e.target.value); if (v) { onPick(v, product); setProduct(null) } }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
        <option value="">{t('page_website.hosts.pick_variant')}</option>
        {product.variants.map((v) => <option key={v.id} value={v.id}>{[v.color, v.size].filter(Boolean).join(' / ')}</option>)}
      </select>
      <button type="button" onClick={() => setProduct(null)} className={btnGhost}>×</button>
    </div>
  )
}

export function productNameById(products, id) {
  return products.find((p) => p.id === id)?.name || `#${id}`
}
export function variantLabelById(products, vid) {
  for (const p of products) {
    const v = p.variants?.find((x) => x.id === vid)
    if (v) return `${p.name} · ${[v.color, v.size].filter(Boolean).join(' / ')}`
  }
  return `#${vid}`
}
