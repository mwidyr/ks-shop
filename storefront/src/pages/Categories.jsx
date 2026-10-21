import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHosts, getProducts, img, onImgError, sized } from '../lib/api'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { HostCard, LiveBadge } from '../components/HostCard'
import { IconPlay } from '../components/Icons'
import { EmptyState, SectionHead } from '../components/ui'

// featured tiles take two rows: the ones the shop marks (featured), else the first tile of a group with more than two
const tall = (tiles, i) => (tiles.some((c) => typeof c.featured === 'boolean') ? Boolean(tiles[i].featured) : i === 0 && tiles.length > 2)
const label = { position: 'absolute', left: 10, bottom: 10, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.95)', color: 'var(--color-text)', fontSize: 15, fontWeight: 700 }

export default function Categories() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const { categories } = useStore()
  const [hosts, setHosts] = useState([])
  const [dealImg, setDealImg] = useState('')
  useSeo({ title: t('cats.title'), description: t('cats.title'), canonical: '/categories' })
  useEffect(() => { getHosts().then((d) => setHosts(d.hosts || [])).catch(() => setHosts([])) }, [i18n.language])
  useEffect(() => { getProducts({ sale: 'true', limit: 1 }).then((d) => setDealImg(d.products?.[0]?.images?.[0] || '')).catch(() => setDealImg('')) }, [])

  return (
    <div>
      <div style={{ padding: desktop ? '32px 40px 0' : '16px 16px 0' }}><h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{t('cats.title')}</h1></div>

      {hosts.length > 0 && (
        <section style={{ padding: '18px 0 0' }}>
          <SectionHead eyebrow={t('cats.hosts_eyebrow')} title={t('cats.hosts_title')} to="/hosts" linkLabel={t('cats.all_hosts')} gap={12} />
          <div style={{ display: 'flex', gap: 8, padding: `0 ${desktop ? 40 : 16}px 12px`, fontSize: 12, color: 'var(--color-text-2)' }}>
            <LiveBadge text={t('host.live_now')} />
            <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(30,30,35,0.78)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{t('cats.legend_next', { time: '20:00' })}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 11, fontWeight: 700 }}><IconPlay size={10} />{t('host.has_replay')}</span>
          </div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: `0 ${desktop ? 40 : 16}px 4px` }}>
            {hosts.slice(0, 8).map((h) => <HostCard key={h.id} h={h} width={156} />)}
          </div>
        </section>
      )}

      <section style={{ padding: `26px ${desktop ? 40 : 16}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{t('cats.deals_eyebrow')}</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('cats.deals_title')}</h2></div></div>
        <Link to="/products?live=true" style={{ marginTop: 12, display: 'flex', height: 120, borderRadius: 20, overflow: 'hidden', background: 'var(--color-primary-soft)', color: 'var(--color-text)', textDecoration: 'none' }}>
          <span style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-live)', fontWeight: 700 }}>{t('cats.deals_note')}</span>
            <span className="serif" style={{ fontSize: 26, fontWeight: 700 }}>{t('cats.deals_big')}</span>
          </span>
          {dealImg && <img src={sized(img(dealImg), 320)} alt="" loading="lazy" onError={onImgError} style={{ width: 140, height: '100%', objectFit: 'cover' }} />}
        </Link>
      </section>

      {categories.length === 0 && <EmptyState title={t('cats.empty')} />}
      {categories.map((g) => {
        const kids = g.children?.length ? g.children : []
        const tiles = kids.length ? kids : [g]
        return (
          <section key={g.id} style={{ padding: `26px ${desktop ? 40 : 16}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{g.display}</h2>
              <Link to={`/c/${encodeURIComponent(g.name)}`} style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{t('cats.all')}</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 4 : 2}, minmax(0, 1fr))`, gridAutoRows: 150, gridAutoFlow: 'dense', gap: 10, marginTop: 12 }}>
              {tiles.map((c, i) => (
                <Link key={c.id} to={`/c/${encodeURIComponent(c.name)}`} style={{ position: 'relative', gridRow: !desktop && tall(tiles, i) ? 'span 2' : 'span 1', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', background: 'var(--color-bg-soft)' }}>
                  <img src={sized(img(c.cover_url), 480)} alt={c.display} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} />
                  <span style={label}>{c.display}</span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
      <div style={{ height: 120 }} />
    </div>
  )
}
