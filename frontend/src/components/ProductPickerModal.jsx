import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProducts } from '../api/products'
import { resolveUrl } from '../utils/image'
import { formatCurrency } from '../utils/format'
import { IconChevronDown } from './icons'

// Same product-search predicate as Inventory.jsx, so "find a product" behaves identically
// everywhere in the app.
function productMatches(product, q) {
  if (product.name.toLowerCase().includes(q)) return true
  if (product.sku && product.sku.toLowerCase().includes(q)) return true
  return product.variants.some((v) =>
    v.sku.toLowerCase().includes(q) || v.color.toLowerCase().includes(q) || v.size.toLowerCase().includes(q))
}

function PickerVariantRow({ product, variant, qty, onChangeQty }) {
  const { t } = useTranslation()
  const isOversell = variant.total_stock < 0

  return (
    <tr className={qty > 0 ? 'bg-brand-50/40' : 'hover:bg-gray-50'}>
      <td className="p-3">
        <p className="text-sm text-gray-700">{product.sku} · {variant.color}/{variant.size}</p>
        <p className="text-xs text-gray-400">{formatCurrency(variant.price)}</p>
      </td>
      <td className="p-3 text-center">
        <span className={isOversell ? 'text-red-600 font-bold' : 'text-gray-600'}>{variant.total_stock}</span>
        <p className="text-[10px] text-gray-400">{t('page_order_create.picker_available_stock')}</p>
      </td>
      <td className="p-3 text-right">
        <input
          type="number" min="0" value={qty}
          onChange={(e) => onChangeQty(Math.max(0, Number(e.target.value) || 0))}
          className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
        />
      </td>
    </tr>
  )
}

function PickerProductCard({ product, forceOpen, pending, setQty }) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open
  const selectedInProduct = product.variants.filter((v) => pending[v.id] > 0).length

  return (
    <div className="bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50"
      >
        <img src={resolveUrl(product.images[0]?.url)} className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0" />
        <div className="flex-1 min-w-0">
          {product.sku && <p className="text-xs font-bold text-brand-600">{product.sku}</p>}
          <p className="font-semibold text-gray-800 truncate">{product.name}</p>
        </div>
        {selectedInProduct > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 shrink-0">{selectedInProduct}</span>
        )}
        <IconChevronDown width={16} height={16} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <table className="w-full text-sm border-t">
          <tbody className="divide-y">
            {product.variants.map((variant) => (
              <PickerVariantRow
                key={variant.id}
                product={product}
                variant={variant}
                qty={pending[variant.id] || 0}
                onChangeQty={(qty) => setQty(product, variant, qty)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Popup for adding products to an order block: search, expand a product to see every variant's
// real available stock, set quantities across as many products as needed, then commit them all
// at once with "Simpan" - mirrors Inventory.jsx's card/row pattern but with qty inputs instead
// of stock-editing controls.
export default function ProductPickerModal({ onClose, onAdd }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState({}) // variantId -> qty

  useEffect(() => {
    listProducts().then((data) => {
      setProducts(data.filter((p) => p.is_active))
      setLoading(false)
    })
  }, [])

  function setQty(product, variant, qty) {
    setPending((p) => {
      const next = { ...p }
      if (qty > 0) next[variant.id] = qty
      else delete next[variant.id]
      return next
    })
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? products.filter((p) => productMatches(p, q)) : products
  const selectedCount = Object.keys(pending).length

  const variantIndex = useMemo(() => {
    const idx = {}
    for (const p of products) for (const v of p.variants) idx[v.id] = { product: p, variant: v }
    return idx
  }, [products])

  function handleSave() {
    const items = Object.entries(pending).map(([variantId, qty]) => {
      const { product, variant } = variantIndex[variantId]
      return {
        variantId: Number(variantId), qty,
        productName: product.name, variantLabel: `${variant.color}/${variant.size}`,
        imageUrl: product.images[0]?.url || '', price: variant.price, sku: product.sku,
      }
    })
    onAdd(items)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg text-gray-800">{t('page_order_create.picker_title')}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('page_order_create.picker_search_placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-center text-gray-400 py-8">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">{t('page_order_create.picker_empty')}</p>
          ) : (
            filtered.map((product) => (
              <PickerProductCard key={product.id} product={product} forceOpen={Boolean(q)} pending={pending} setQty={setQty} />
            ))
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-sm text-gray-500">{t('page_order_create.picker_selected_count', { count: selectedCount })}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={selectedCount === 0} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-full">
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
