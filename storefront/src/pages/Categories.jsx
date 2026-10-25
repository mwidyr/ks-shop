import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCategoryLayout, getHosts, getProducts, img, onImgError, sized } from '../lib/api'
import { useSeo } from '../lib/seo'
import { mosaicCells } from '../lib/mosaic'
import { HostCard, LiveBadge, OffBadge } from '../components/HostCard'
import { EmptyState, SectionHead } from '../components/ui'

const label = { position: 'absolute', left: 10, bottom: 10, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.95)', color: 'var(--color-text)', fontSize: 15, fontWeight: 700 }
// phone: the same four-column mosaic as desktop, so the cards are small and their labels smaller
const labelSmall = { ...label, left: 6, bottom: 6, maxWidth: 'calc(100% - 12px)', boxSizing: 'border-box', padding: '3px 7px', borderRadius: 8, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

export default function Categories() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const [layout, setLayout] = useState(null)
  const [hosts, setHosts] = useState([])
  const [dealImg, setDealImg] = useState('')
  useSeo({ title: t('cats.title'), description: t('cats.title'), canonical: '/categories' })
  useEffect(() => { getHosts().then((d) => setHosts(d.hosts || [])).catch(() => setHosts([])) }, [i18n.language])
  useEffect(() => { getCategoryLayout().then((d) => setLayout(d.sections || [])).catch(() => setLayout([])) }, [i18n.language])
  useEffect(() => { getProducts({ sale: 'true', limit: 1 }).then((d) => setDealImg(d.products?.[0]?.images?.[0] || '')).catch(() => setDealImg('')) }, [])

  return (
    <div>
      <div style={{ padding: desktop ? '32px 40px 0' : '16px 16px 0' }}><h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{t('cats.title')}</h1></div>

      {hosts.length > 0 && (
        <section style={{ padding: '18px 0 0' }}>
          <SectionHead eyebrow={t('cats.hosts_eyebrow')} title={t('cats.hosts_title')} to="/hosts" linkLabel={t('cats.all_hosts')} gap={12} />
          <div style={{ display: 'flex', gap: 8, padding: `0 ${desktop ? 40 : 16}px 12px`, fontSize: 12, color: 'var(--color-text-2)' }}>
            <LiveBadge text={t('host.live_now')} />
            <OffBadge />
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

      {layout && layout.every((sec) => !sec.slots.some(Boolean)) && <EmptyState title={t('cats.empty')} />}
      {(layout || []).map((sec) => {
        // phones get the desktop mosaic (large card 2x2 beside four small ones, 4 columns) as long as the section has its
        // large card; an all-small section or one without its large card stays 2 columns so the labels stay readable
        const wide = desktop || (sec.template !== 'all_small' && Boolean(sec.slots[0]))
        const cells = mosaicCells(sec.template, sec.slots, wide)
        if (!cells.length) return null
        return (
          <section key={sec.id} data-testid="mosaic-section" style={{ padding: `${desktop ? 26 : 18}px ${desktop ? 40 : 16}px 0` }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 4 : 2}, minmax(0, 1fr))`, gridAutoRows: desktop ? 200 : wide ? 100 : 140, gap: desktop ? 12 : 8 }}>
              {cells.map(({ card, style }) => (
                <Link key={card.id} to={`/c/${encodeURIComponent(card.name)}`} style={{ ...style, position: 'relative', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', background: 'var(--color-bg-soft)' }}>
                  <img src={sized(img(card.cover_url), 640)} alt={card.display} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} />
                  <span style={desktop || !wide ? label : labelSmall}>{card.display}</span>
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
