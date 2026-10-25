import { useTranslation } from 'react-i18next'
import { useMasterData } from '../../context/MasterDataContext'
import { resolveUrl } from '../../utils/image'
import { btnGhost } from './Pickers'

// Featured categories on the homepage (#145): pick which categories show and in what order.
// Nothing picked = automatic (categories marked "show on home" first).
export default function FeaturedCategoriesPicker({ categories, value, onChange }) {
  const { t } = useTranslation()
  const { translateCategory } = useMasterData()
  const byID = new Map(categories.map((c) => [c.id, c]))
  const picked = value.map((id) => byID.get(id)).filter(Boolean)
  const rest = categories.filter((c) => !value.includes(c.id))
  const move = (i, d) => { const n = [...value]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n) }
  const row = 'flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm'
  return (
    <div className="space-y-2" data-testid="featured-picker">
      <p className="text-xs text-gray-500">{t('page_website.home.cat_picker_hint')}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-gray-600">{t('page_website.home.cat_picked', { n: picked.length })}</div>
          {picked.length === 0 && <div className="text-xs text-gray-400">{t('page_website.home.cat_auto')}</div>}
          {picked.map((c, i) => (
            <div key={c.id} className={row}>
              {c.cover_url ? <img src={resolveUrl(c.cover_url)} alt="" className="w-8 h-8 rounded object-cover" /> : <span className="w-8 h-8 rounded bg-gray-100" />}
              <span className="flex-1 truncate">{translateCategory(c.name)}</span>
              <button type="button" className={btnGhost} onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('page_website.common.up')}>▲</button>
              <button type="button" className={btnGhost} onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label={t('page_website.common.down')}>▼</button>
              <button type="button" className="text-red-600 px-1" onClick={() => onChange(value.filter((id) => id !== c.id))} aria-label={t('page_website.banners.delete')}>×</button>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          <div className="text-xs font-semibold text-gray-600">{t('page_website.home.cat_available')}</div>
          {rest.map((c) => (
            <button key={c.id} type="button" onClick={() => onChange([...value, c.id])} className={`${row} w-full text-left hover:bg-gray-50 ${c.count > 0 ? '' : 'opacity-50'}`}>
              {c.cover_url ? <img src={resolveUrl(c.cover_url)} alt="" className="w-8 h-8 rounded object-cover" /> : <span className="w-8 h-8 rounded bg-gray-100" />}
              <span className="flex-1 truncate">{translateCategory(c.name)}</span>
              <span className="text-xs text-gray-400">{c.count}</span>
              <span className="text-brand-600">+</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
