import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { img, onImgError, sized, srcSet } from '../lib/api'
import { discountPct, money } from '../lib/format'
import { useFavorites } from '../lib/favorites'
import { IconHeart, IconPlus } from './Icons'
import { useQuickAdd } from './QuickAdd'
import RestockSheet from './RestockSheet'
import { useState } from 'react'

export const productPath = (p) => `/p/${p.id}`

const badge = (bg) => ({ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 6, background: bg, color: '#FFFFFF', fontSize: 11, fontWeight: 700 })

// Grid card (2 columns on mobile): favourite top-right, quick add bottom-right, name 2 lines, price / was / -%.
export function ProductCard({ p, badgeKind, badgeText, eager, dropFrom = 0, showPct = true }) {
  const { t } = useTranslation()
  const { has, toggle } = useFavorites()
  const quick = useQuickAdd()
  const pct = discountPct(p.price, p.compare_at)
  const fav = has(p.id)
  const [restock, setRestock] = useState(false)
  const low = p.in_stock && p.stock_left > 0 && p.stock_left <= 3
  const dropped = dropFrom > p.price
  const kind = badgeKind || (dropped ? 'drop' : p.is_live ? 'live' : p.is_new ? 'new' : low ? 'low' : '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'var(--color-bg-soft)' }}>
        <Link to={productPath(p)} style={{ display: 'block', width: '100%', height: '100%' }}>
          <img src={sized(img(p.image), 320)} srcSet={srcSet(p.image)} sizes="(min-width:1024px) 240px, 50vw" alt={p.name} loading={eager ? 'eager' : 'lazy'} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Link>
        {kind === 'live' && <span style={badge('var(--color-live)')}>{p.live_code ? t('product.live_code_badge', { code: p.live_code }) : t('product.live_product')}</span>}
        {kind === 'worn' && <span style={badge('var(--color-text)')}>{badgeText}</span>}
        {kind === 'drop' && <span style={badge('var(--color-live)')}>{t('wish.drop_badge')}</span>}
        {kind === 'low' && <span style={badge('var(--color-text)')}>{t('common.low_stock', { n: p.stock_left })}</span>}
        {kind === 'new' && <span style={badge('var(--color-text)')}>{t('common.new')}</span>}
        {!p.in_stock && <span style={{ ...badge('rgba(30,30,35,0.78)'), left: 'auto', right: 8, top: 44 }}>{t('common.sold_out')}</span>}
        <button type="button" aria-label={t('product.favorite')} aria-pressed={fav} onClick={() => toggle({ id: p.id, price: p.price, name: p.name, image: p.image })}
          style={{ position: 'absolute', top: 6, right: 6, width: 34, height: 34, borderRadius: 17, border: 'none', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: fav ? 'var(--color-live)' : 'var(--color-text)' }}>
          <IconHeart filled={fav} strokeWidth={fav ? 2 : 1.8} />
        </button>
        {p.in_stock && (
          <button type="button" aria-label={t('common.add_to_cart')} onClick={() => quick.open(p)}
            style={{ position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18, border: 'none', background: 'var(--color-text)', color: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconPlus size={16} />
          </button>
        )}
      </div>
      <Link to={productPath(p)} style={{ fontSize: 13, lineHeight: 1.4, height: 36, overflow: 'hidden', color: 'var(--color-text)', textDecoration: 'none' }}>{p.name}</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{money(p.price)}</span>
        {dropped
          ? <><span style={{ fontSize: 12, color: 'var(--color-disabled)', textDecoration: 'line-through' }}>{money(dropFrom)}</span><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-live)' }}>{t('wish.dropped', { amount: money(dropFrom - p.price) })}</span></>
          : pct > 0 && <><span style={{ fontSize: 12, color: 'var(--color-disabled)', textDecoration: 'line-through' }}>{money(p.compare_at)}</span>{showPct && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-live)' }}>-{pct}%</span>}</>}
      </div>
      {!p.in_stock && (
        <>
          <button type="button" onClick={() => setRestock(true)} style={{ alignSelf: 'flex-start', minHeight: 32, padding: '0 12px', borderRadius: 16, border: '1.5px solid var(--color-text)', background: 'transparent', color: 'var(--color-text)', fontSize: 12, fontWeight: 700 }}>{t('restock_inline.notify')}</button>
          <RestockSheet open={restock} onClose={() => setRestock(false)} productId={p.id} />
        </>
      )}
    </div>
  )
}

// Compact strip card used in horizontal scrollers (best sellers w/ rank, live products).
export function StripCard({ p, rank, livePrice, width = 136 }) {
  const { t } = useTranslation()
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <Link to={productPath(p)} style={{ width, display: 'flex', flexDirection: 'column', gap: 5, textDecoration: 'none', color: 'var(--color-text)' }}>
        <span style={{ position: 'relative', display: 'block', aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'var(--color-bg-soft)' }}>
          <img src={sized(img(p.image), 280)} srcSet={srcSet(p.image)} sizes={`${width}px`} alt={p.name} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {p.is_live && !livePrice && <span style={{ ...badge('var(--color-live)'), top: 6, left: 6, padding: '2px 7px' }}>{t('common.live_price')}</span>}
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.4, height: 36, overflow: 'hidden' }}>{p.name}</span>
        <b style={{ fontSize: 15 }}>{livePrice ? t('common.price_live', { price: money(p.price) }) : money(p.price)}</b>
      </Link>
      {rank && (
        <span style={{ position: 'absolute', left: -2, top: 150, width: 30, height: 30, borderRadius: 15, background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-bg)' }}>{rank}</span>
      )}
    </div>
  )
}
