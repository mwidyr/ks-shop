import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProducts } from '../lib/api'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { IconBack, IconCart, IconChevDown, IconFilter, IconSearch } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { btnDark, btnOutline, btnPrimary, Chip, EmptyState, ErrorState, iconBtn, ProductGridSkeleton, Sheet, inputStyle } from '../components/ui'

const SORTS = ['newest', 'rec', 'bestseller', 'price_asc', 'price_desc']
const sortKey = { newest: 'sort_newest', rec: 'sort_rec', bestseller: 'sort_best', price_asc: 'sort_asc', price_desc: 'sort_desc' }
// backend: rec = default (newest first)
const toApiSort = (s) => (s === 'rec' ? 'newest' : s)

const mapProduct = (p) => ({
  id: p.id, sku: p.sku, name: p.name, price: p.price, compare_at: p.compare_at > p.price ? p.compare_at : 0, image: p.images?.[0] || '',
  in_stock: p.in_stock, live_code: p.live_code, is_live: Boolean(p.live_code), is_new: Date.now() - new Date(p.created_at).getTime() < 7 * 86400000,
})

export default function ProductList() {
  const { name } = useParams()
  const [sp, setSp] = useSearchParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { desktop } = useOutletContext()
  const { categories } = useStore()
  const q = sp.get('q') || ''
  const sort = sp.get('sort') || 'rec'
  const live = sp.get('live') === 'true'
  const sale = sp.get('sale') === 'true'
  const min = sp.get('min') || ''
  const max = sp.get('max') || ''
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [state, setState] = useState('loading')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [draft, setDraft] = useState({ min, max, live, sale })

  const root = categories.find((c) => c.name === name || c.children?.some((k) => k.name === name))
  const kids = root?.children?.length ? root.children : []
  const siblings = [...kids.filter((c) => c.name === name), ...kids.filter((c) => c.name !== name)] // the one you are in comes first
  const current = categories.flatMap((c) => [c, ...(c.children || [])]).find((c) => c.name === name)
  const title = q ? t('list.title_search', { q }) : current && root && current.id !== root.id ? `${current.display}・${root.display}` : current?.display || t('list.title_all')
  useSeo({ title, description: title, canonical: name ? `/c/${encodeURIComponent(name)}` : '/products', noindex: Boolean(q || min || max || live || sale) })

  const load = useCallback((pg, append) => {
    setState(append ? 'more' : 'loading')
    getProducts({ category: name, q, sort: toApiSort(sort), live: live ? 'true' : '', sale: sale ? 'true' : '', min_price: min, max_price: max, page: pg, limit: 24 })
      .then((d) => { setItems((cur) => (append ? [...cur, ...d.products.map(mapProduct)] : d.products.map(mapProduct))); setTotal(d.total); setPage(pg); setState('ok') })
      .catch(() => setState('error'))
  }, [name, q, sort, live, sale, min, max])
  useEffect(() => { load(1, false) }, [load, i18n.language])

  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const activeFilters = [min || max, live, sale].filter(Boolean).length

  const header = (
    <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
      <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconBack /></button>
      <h1 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
      <Link to="/search" aria-label={t('nav.search_aria')} style={iconBtn}><IconSearch size={20} /></Link>
      <Link to="/cart" aria-label={t('nav.cart')} style={iconBtn}><IconCart /></Link>
    </header>
  )

  return (
    <div>
      {desktop ? <h1 style={{ margin: '32px 40px 0', fontSize: 28 }}>{title}</h1> : header}
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: desktop ? '16px 40px' : '12px 16px' }}>
        {root && <Chip to={`/c/${encodeURIComponent(root.name)}`} active={name === root.name}>{t('common.all')}</Chip>}
        {siblings.map((c) => <Chip key={c.id} to={`/c/${encodeURIComponent(c.name)}`} active={name === c.name}>{c.display}</Chip>)}
        <Chip active={live} onClick={() => setParam('live', live ? '' : 'true')}>{t('list.live')}</Chip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: desktop ? '0 40px 14px' : '0 16px 14px' }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('list.total', { n: total })}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setSortOpen(true)} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 4 }}>{t(`list.${sortKey[sort] || 'sort_rec'}`)} <IconChevDown size={13} /></button>
          <button type="button" onClick={() => { setDraft({ min, max, live, sale }); setFilterOpen(true) }} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconFilter size={14} />{t('list.filter')}
            {activeFilters > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilters}</span>}
          </button>
        </div>
      </div>

      {state === 'loading' && <ProductGridSkeleton n={6} />}
      {state === 'error' && <ErrorState title={t('list.error')} onRetry={() => load(1, false)} />}
      {state !== 'loading' && state !== 'error' && items.length === 0 && (
        <EmptyState title={t('list.empty_title')} text={t('list.empty_text')} action={<Link to="/service" style={{ ...btnOutline, marginTop: 6 }}>{t('common.ask_cs')}</Link>} />
      )}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 5 : 2}, minmax(0, 1fr))`, gap: desktop ? '24px 16px' : '18px 12px', padding: desktop ? '0 40px' : '0 16px' }}>
          {items.map((p, i) => <ProductCard key={p.id} p={p} eager={i < 4} />)}
        </div>
      )}
      {items.length < total && state !== 'loading' && (
        <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
          <button type="button" onClick={() => load(page + 1, true)} disabled={state === 'more'} style={{ ...btnOutline, minWidth: 200 }}>{t('list.more')}</button>
        </div>
      )}
      <div style={{ height: 120 }} />

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t('list.sort')}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {SORTS.map((s) => (
            <button key={s} type="button" onClick={() => { setParam('sort', s === 'rec' ? '' : s); setSortOpen(false) }} style={{ textAlign: 'left', minHeight: 48, padding: '0 4px', border: 'none', borderBottom: '1px solid var(--color-border)', background: 'none', fontSize: 15, fontWeight: sort === s ? 700 : 400, color: 'var(--color-text)' }}>{t(`list.${sortKey[s]}`)}{sort === s ? ' ✓' : ''}</button>
          ))}
        </div>
      </Sheet>
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('list.filter_title')}
        footer={<div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { const n = new URLSearchParams(sp); ['min', 'max', 'live', 'sale'].forEach((k) => n.delete(k)); setSp(n, { replace: true }); setFilterOpen(false) }} style={{ ...btnOutline, flex: 1 }}>{t('list.reset')}</button>
          <button type="button" onClick={() => { const n = new URLSearchParams(sp); [['min', draft.min], ['max', draft.max], ['live', draft.live ? 'true' : ''], ['sale', draft.sale ? 'true' : '']].forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); setFilterOpen(false) }} style={{ ...btnPrimary, flex: 2 }}>{t('list.show')}</button>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <b style={{ fontSize: 14 }}>{t('list.price')}</b>
          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label={t('list.min')} placeholder={t('list.min')} inputMode="numeric" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value.replace(/\D/g, '') })} style={inputStyle(false)} />
            <input aria-label={t('list.max')} placeholder={t('list.max')} inputMode="numeric" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value.replace(/\D/g, '') })} style={inputStyle(false)} />
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}><input type="checkbox" checked={draft.live} onChange={(e) => setDraft({ ...draft, live: e.target.checked })} />{t('list.only_live')}</label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}><input type="checkbox" checked={draft.sale} onChange={(e) => setDraft({ ...draft, sale: e.target.checked })} />{t('list.only_sale')}</label>
        </div>
      </Sheet>
      <span hidden style={btnDark} />
    </div>
  )
}
