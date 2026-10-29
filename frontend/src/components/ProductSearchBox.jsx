import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { allProductNames, localizedProductName } from '../utils/productName'
import AttachmentThumb from './AttachmentThumb'
import ImagePreviewModal from './ImagePreviewModal'
import { IconClose } from './icons'

// A type-to-search product picker (code or name), used anywhere a page needs the user to pick
// one product by SKU - originally built for ProductPerformance.jsx, now shared with
// ProductColorPair.jsx too. Names follow the admin language. The picked product shows as a tag with
// its thumbnail (tap = larger image) and an X that clears it.
export default function ProductSearchBox({ products, sku, onPick, placeholder }) {
  const { t, i18n } = useTranslation()
  const [preview, setPreview] = useState(false)
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    // Clicking/focusing the field shows an initial browsable list immediately instead of
    // requiring the user to type first (item 009) - typing then narrows it as before.
    if (!q) return products.slice(0, 50)
    return products
      .filter((p) => allProductNames(p).includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [products, term])

  const selected = products.find((p) => p.sku === sku)

  return (
    <div className="relative w-full sm:w-80">
      {selected && (
        <div className="flex items-center gap-2 mb-2 border border-gray-200 rounded-lg p-1.5 pr-8 relative">
          {selected.images?.[0]?.url ? (
            <AttachmentThumb url={selected.images[0].url} onPreview={() => setPreview(true)} className="w-9 h-9" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm text-[var(--text-primary)] truncate">{localizedProductName(selected, i18n.language)}</p>
            <p className="font-mono text-[11px] text-brand-600">{selected.sku}</p>
          </div>
          <button type="button" onClick={() => onPick('')} aria-label={t('common.delete')} title={t('common.delete')}
            className="absolute top-1/2 -translate-y-1/2 right-1.5 w-6 h-6 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 flex items-center justify-center">
            <IconClose width={14} height={14} />
          </button>
        </div>
      )}
      <input
        value={open ? term : ''}
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
              <span className="text-gray-700 truncate">{localizedProductName(p, i18n.language)}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}
      {preview && selected?.images?.length > 0 && <ImagePreviewModal images={selected.images} onClose={() => setPreview(false)} />}
    </div>
  )
}
