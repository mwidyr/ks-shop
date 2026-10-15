import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCards, img, onImgError, sized } from '../lib/api'
import { useArticleFavs } from '../lib/articleFavs'
import { useFavorites } from '../lib/favorites'
import { useSeo } from '../lib/seo'
import { IconCart } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { EmptyState, PageHeader, btnPrimary, ProductGridSkeleton } from '../components/ui'

const pill = (on) => ({ flex: 'none', height: 34, padding: '0 14px', borderRadius: 17, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })

// Favourites (artboard Wishlist): products (with price-drop flags) and saved style articles.
export default function Wishlist() {
  const { t } = useTranslation()
  const { items } = useFavorites()
  const articles = useArticleFavs()
  const [tab, setTab] = useState('products')
  const [cards, setCards] = useState(null)
  useSeo({ title: t('wish.title'), noindex: true })
  const idKey = items.map((i) => i.id).join(',')
  useEffect(() => {
    if (!items.length) { setCards([]); return }
    getCards(items.map((i) => i.id)).then((d) => setCards(d.items || [])).catch(() => setCards([]))
  }, [idKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const saved = Object.fromEntries(items.map((i) => [i.id, i.price]))
  const dropped = (cards || []).filter((c) => saved[c.id] && c.price < saved[c.id])
  const cartLink = (
    <Link to="/cart" aria-label={t('wish.cart')} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', position: 'relative' }}>
      <IconCart size={22} />
    </Link>
  )
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('wish.title')} to="/member" right={cartLink} />
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px' }}>
        <button type="button" onClick={() => setTab('products')} style={pill(tab === 'products')}>{t('wish.products', { n: items.length })}</button>
        <button type="button" onClick={() => setTab('articles')} style={pill(tab === 'articles')}>{t('wish.articles', { n: articles.count })}</button>
      </div>
      {tab === 'products' && (
        <>
          {dropped.length > 0 && <div style={{ margin: '0 16px 14px', padding: '10px 14px', borderRadius: 12, background: 'var(--color-primary-soft)', fontSize: 13, color: 'var(--color-text)' }}>{t('wish.drop_banner', { n: dropped.length })}</div>}
          {cards === null && <ProductGridSkeleton n={4} />}
          {cards && cards.length === 0 && <EmptyState title={t('wish.empty_title')} text={t('wish.empty_text')} action={<Link to="/products" style={{ ...btnPrimary, marginTop: 8 }}>{t('wish.browse')}</Link>} />}
          {cards && cards.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px 12px', padding: '0 16px' }}>
              {cards.map((c) => <ProductCard key={c.id} p={c} dropFrom={saved[c.id] || 0} showPct={false} />)}
            </div>
          )}
        </>
      )}
      {tab === 'articles' && (
        articles.items.length === 0 ? <EmptyState title={t('wish.articles_empty')} text={t('wish.empty_text')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
            {articles.items.map((a) => (
              <Link key={a.slug} to={a.path || (a.host ? `/hosts/${a.host}/journal/${a.slug}` : `/style/${a.slug}`)} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'var(--color-text)', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <img src={sized(img(a.cover), 240)} alt="" onError={onImgError} style={{ width: 96, height: 96, objectFit: 'cover', flex: 'none' }} />
                <span style={{ flex: 1, padding: '10px 10px 10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b style={{ fontSize: 14, lineHeight: 1.35 }}>{a.title}</b>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{a.summary}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('wish.read')}</span>
                </span>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
