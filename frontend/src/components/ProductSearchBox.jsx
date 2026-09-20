import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

// A type-to-search product picker (code or name), used anywhere a page needs the user to pick
// one product by SKU - originally built for ProductPerformance.jsx, now shared with
// ProductColorPair.jsx too.
export default function ProductSearchBox({ products, sku, onPick, placeholder }) {
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [products, term])

  const selected = products.find((p) => p.sku === sku)

  return (
    <div className="relative w-full sm:w-80">
      <input
        value={open ? term : selected ? `${selected.sku} · ${selected.name}` : term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
        onFocus={() => { setTerm(''); setOpen(true) }}
        placeholder={placeholder || t('page_product_performance.search_placeholder')}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p.sku); setOpen(false); setTerm('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="font-mono text-xs text-brand-600 shrink-0">{p.sku || '-'}</span>
              <span className="text-gray-700 truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}
