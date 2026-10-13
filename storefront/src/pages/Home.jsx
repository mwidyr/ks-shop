import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHome, img, onImgError, sized } from '../lib/api'
import { formatNumber, money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { topicText, waUrl } from '../lib/wa'
import { whenLabel } from '../lib/when'
import { Footer, MainHeader } from '../components/Layout'
import { HostCard, LiveBadge } from '../components/HostCard'
import { IconHeadset, IconPlay, IconSearch, IconWhatsApp } from '../components/Icons'
import { ProductCard, StripCard } from '../components/ProductCard'
import { ErrorState, ProductGridSkeleton, SectionHead, Skeleton } from '../components/ui'

const tile = { position: 'relative', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', background: 'var(--color-bg-soft)', display: 'block' }
const tileLabel = (big) => ({ position: 'absolute', left: big ? 12 : 8, bottom: big ? 12 : 8, padding: big ? '6px 12px' : '5px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.95)', color: 'var(--color-text)', fontSize: big ? 15 : 13, fontWeight: 700 })

function Eyebrowless({ children }) {
  return <section style={{ padding: '28px 0 0' }}>{children}</section>
}

function LiveArea({ data, desktop }) {
  const { t, i18n } = useTranslation()
  const { host, products, coupon } = data
  const live = host.live_status === 'live'
  const perk = coupon?.value > 0
  const shot = products?.[0]?.image || host.avatar_url
  const box = desktop
    ? { position: 'relative', height: 440, borderRadius: 24, overflow: 'hidden', border: `3px solid ${live ? 'var(--color-live)' : 'var(--color-border)'}`, boxSizing: 'border-box', textDecoration: 'none', color: '#FFFFFF', display: 'block' }
    : null
  if (desktop) {
    return (
      <Link to={`/hosts/${host.slug}`} className={live ? 'live-pulse' : ''} style={box}>
        <img src={sized(img(host.avatar_url), 900)} alt={host.name} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} />
        <span style={{ position: 'absolute', top: 16, left: 16 }}>{live ? <LiveBadge text={t('home.live_now')} /> : <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(30,30,35,0.78)', fontSize: 11, fontWeight: 700 }}>{t('host.not_live_at', { when: whenLabel(host.next_live_at, t, i18n.language) })}</span>}</span>
        <span style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: 16, borderRadius: 16, background: 'rgba(30,30,35,0.8)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b className="serif" style={{ fontSize: 20 }}>{host.name}・{host.live_title || host.next_live_title}</b>
          {perk && <span style={{ fontSize: 13 }}>{t('home.perk', { amount: money(coupon.value) })}{live && host.viewer_count != null ? `・${t('home.viewers', { n: formatNumber(host.viewer_count) })}` : ''}</span>}
          <span style={{ minHeight: 44, borderRadius: 22, background: 'var(--color-live)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 700 }}><IconPlay size={14} />{t('home.enter_live')}</span>
        </span>
      </Link>
    )
  }
  return (
    <section aria-label={t('home.live_area')} style={{ margin: '16px 16px 0', borderRadius: 20, background: 'var(--color-surface)', border: '1.5px solid var(--color-live-soft)', boxShadow: '0 4px 16px rgba(30,30,35,0.06)', padding: 12, color: 'var(--color-text)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-live)', fontWeight: 700 }}>{t('home.live_eyebrow')}</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('home.live_area')}</h2>
        </span>
        <Link to="/live" style={{ fontSize: 13, color: 'var(--color-text)' }}>{t('home.all_live')}</Link>
      </div>
      <Link to={`/hosts/${host.slug}`} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'var(--color-text)' }}>
        <span className={live ? 'live-pulse' : ''} style={{ position: 'relative', flex: 'none', width: 128, height: 200, borderRadius: 14, overflow: 'hidden', border: `2.5px solid ${live ? 'var(--color-live)' : 'var(--color-border)'}`, boxSizing: 'border-box', display: 'block' }}>
          <img src={sized(img(host.avatar_url), 400)} alt={host.name} fetchpriority="high" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} />
          <span style={{ position: 'absolute', top: 8, left: 8 }}>{live ? <LiveBadge text={t('home.live_now')} /> : <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(30,30,35,0.78)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{t('host.not_live_at', { when: whenLabel(host.next_live_at, t, i18n.language) })}</span>}</span>
          {live && host.viewer_count != null && <span style={{ position: 'absolute', left: 8, bottom: 8, padding: '2px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: 11 }}>{t('home.viewers', { n: formatNumber(host.viewer_count) })}</span>}
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>{host.name}{(host.live_title || host.next_live_title) ? `・${host.live_title || host.next_live_title}` : ''}</b>
          <span className="serif" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>{t('home.worn_by_host')}<br />{t('home.buy_here')}</span>
          {perk && <span style={{ alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, background: 'var(--color-coupon-bg)', border: '1.5px dashed var(--color-secondary)', color: 'var(--color-text)', fontSize: 12, fontWeight: 900 }}>{t('home.perk', { amount: money(coupon.value) })}</span>}
          <span style={{ flex: 1 }} />
          <span style={{ minHeight: 44, borderRadius: 22, background: live ? 'var(--color-live)' : 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: live ? '#FFFFFF' : 'var(--color-bg)' }}>
            {live ? <><IconPlay size={14} />{t('home.enter_live')}</> : t('host.see_outfit')}
          </span>
        </span>
      </Link>
      {products?.length > 0 && (
        <>
          <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('home.showing', { name: host.name })}</span>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {products.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} style={{ flex: 'none', width: 104, display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--color-text)' }}>
                <img src={sized(img(p.image), 220)} alt={p.name} loading="lazy" onError={onImgError} style={{ width: 104, height: 132, borderRadius: 10, objectFit: 'cover' }} />
                <span style={{ fontSize: 12, height: 32, overflow: 'hidden', lineHeight: 1.35 }}>{p.name}</span>
                <b style={{ fontSize: 15 }}>{t('common.price_live', { price: money(p.price) })}</b>
              </Link>
            ))}
          </div>
        </>
      )}
      <span hidden>{shot}</span>
    </section>
  )
}

function Hero({ image, desktop }) {
  const { t } = useTranslation()
  return (
    <Link to="/products?sort=newest" style={{ display: 'block', position: 'relative', margin: desktop ? 0 : '14px 16px 0', height: desktop ? 440 : 190, borderRadius: desktop ? 24 : 18, overflow: 'hidden', textDecoration: 'none', color: '#FFFFFF', background: 'linear-gradient(135deg, var(--color-primary-soft), var(--color-secondary))' }}>
      {image && <img src={sized(img(image), 1000)} alt={t('home.hero_alt')} fetchpriority="high" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: desktop ? '46%' : '60%', background: 'rgba(30,30,35,0.66)', padding: desktop ? 40 : 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: desktop ? 10 : 6 }}>
        <span style={{ fontSize: desktop ? 12 : 11, letterSpacing: desktop ? 3 : 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{t('home.hero_eyebrow')}</span>
        <span className="serif" style={{ fontSize: desktop ? 44 : 20, fontWeight: 700, lineHeight: desktop ? 1.2 : 1.3 }}>{t('home.hero_title')}<br />{t('home.hero_sub')}</span>
        <span style={{ fontSize: desktop ? 15 : 13, fontWeight: 700 }}>{t('home.hero_cta')}</span>
      </span>
    </Link>
  )
}

function Categories({ list, desktop, title, subtitle }) {
  const { t } = useTranslation()
  return (
    <Eyebrowless>
      <SectionHead eyebrow={t('home.cat_eyebrow')} title={title} to="/categories" linkLabel={subtitle} />
      <div style={desktop
        ? { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16, padding: '0 40px' }
        : { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 120, gap: 8, padding: '0 16px' }}>
        {list.map((c, i) => (
          <Link key={c.id} to={`/c/${encodeURIComponent(c.name)}`} style={{ ...tile, ...(desktop ? { height: 240, borderRadius: 18 } : { gridRow: i === 0 ? 'span 2' : 'span 1' }) }}>
            <img src={sized(img(c.cover_url), 480)} alt={c.display} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} />
            <span style={tileLabel(desktop)}>{c.display}</span>
          </Link>
        ))}
      </div>
    </Eyebrowless>
  )
}

function Topics({ list, desktop, title, subtitle }) {
  const { t } = useTranslation()
  const [first, ...rest] = list
  const card = (c, big) => (
    <Link key={c.id} to={`/style/${c.slug}`} style={{ display: 'flex', flexDirection: 'column', borderRadius: big ? 18 : 14, overflow: 'hidden', background: 'var(--color-surface)', textDecoration: 'none', color: 'var(--color-text)' }}>
      <img src={sized(img(c.cover_url), 640)} alt={c.title} loading="lazy" onError={onImgError} style={{ width: '100%', height: big ? 200 : 120, objectFit: 'cover', objectPosition: big ? 'center 30%' : 'center 25%', background: 'var(--color-bg-soft)' }} />
      <span style={{ padding: big ? '14px 16px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: big ? 4 : 3 }}>
        {big ? <h3 className="serif" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{c.title}</h3> : <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{c.title}</h3>}
        <span style={{ fontSize: big ? 13 : 12, color: 'var(--color-text-2)', lineHeight: big ? undefined : 1.45 }}>{c.summary}</span>
        <span style={{ fontSize: big ? 13 : 12, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('home.read_topic')}</span>
      </span>
    </Link>
  )
  return (
    <section aria-labelledby="topic-t" style={{ marginTop: 32, padding: desktop ? '40px 40px 32px' : '28px 16px 24px', background: 'var(--color-bg-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{t('home.topics_eyebrow')}</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}><span id="topic-t">{title}</span></h2>
        </div>
        <Link to="/style" style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{subtitle}</Link>
      </div>
      <p style={{ margin: '6px 0 14px', fontSize: 13, color: 'var(--color-text-2)' }}>{t('home.topics_hint')}</p>
      {desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>{list.map((c, i) => card(c, i === 0))}</div>
      ) : (
        <>
          {first && card(first, true)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>{rest.map((c) => card(c, false))}</div>
        </>
      )}
    </section>
  )
}

export default function Home() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const { settings, threshold } = useStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useSeo({ title: '', description: t('home.hero_sub') + ' · ralulu', canonical: '/' })

  const load = useCallback(() => {
    setError(false)
    getHome().then(setData).catch(() => setError(true))
  }, [])
  useEffect(() => { load() }, [load, i18n.language])

  const mods = Object.fromEntries((data?.modules || []).map((m) => [m.key, m]))
  const heroImage = mods.new_in?.data?.[0]?.image || mods.best_sellers?.data?.[0]?.image
  const order = (data?.modules || []).map((m) => m.key)

  const sections = {
    live: () => !desktop && mods.live && <LiveArea key="live" data={mods.live.data} desktop={false} />,
    categories: () => mods.categories && <Categories key="categories" list={mods.categories.data} desktop={desktop} title={mods.categories.title} subtitle={mods.categories.subtitle} />,
    best_sellers: () => mods.best_sellers && (
      <Eyebrowless key="best">
        <SectionHead eyebrow={t('home.best_eyebrow')} title={mods.best_sellers.title} to="/products?sort=bestseller" linkLabel={mods.best_sellers.subtitle} />
        {desktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '24px 16px', padding: '0 40px' }}>
            {mods.best_sellers.data.slice(0, 10).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>
            {mods.best_sellers.data.map((p, i) => <StripCard key={p.id} p={p} rank={i + 1} />)}
          </div>
        )}
      </Eyebrowless>
    ),
    new_in: () => mods.new_in && (
      <Eyebrowless key="new">
        <SectionHead eyebrow={t('home.new_eyebrow')} title={mods.new_in.title} to="/products?sort=newest" linkLabel={mods.new_in.subtitle} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 4 : 2}, minmax(0, 1fr))`, gap: desktop ? '24px 16px' : '18px 12px', padding: desktop ? '0 40px' : '0 16px' }}>
          {mods.new_in.data.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </Eyebrowless>
    ),
    hosts: () => mods.hosts && (
      <Eyebrowless key="hosts">
        <SectionHead eyebrow={t('home.hosts_eyebrow')} title={mods.hosts.title} to="/hosts" linkLabel={mods.hosts.subtitle} />
        {desktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16, padding: '0 40px' }}>
            {mods.hosts.data.slice(0, 6).map((h) => <HostCard key={h.id} h={h} width="100%" />)}
          </div>
        ) : (
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>
            {mods.hosts.data.map((h) => <HostCard key={h.id} h={h} />)}
          </div>
        )}
      </Eyebrowless>
    ),
    topics: () => mods.topics && <Topics key="topics" list={mods.topics.data} desktop={desktop} title={mods.topics.title} subtitle={mods.topics.subtitle} />,
  }

  const cs = (
    <section key="cs" style={{ margin: desktop ? '24px 40px 0' : '24px 16px 0', padding: 18, borderRadius: 18, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <span style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--color-bg)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconHeadset size={28} /></span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <b style={{ fontSize: 17 }}>{t('home.cs_title')}</b>
          <span style={{ fontSize: 13, color: 'var(--color-border)' }}>{t('home.cs_sub')}</span>
        </span>
      </div>
      <a href={waUrl(settings.whatsapp_number, topicText(i18n.language, 'order'))} target="_blank" rel="noreferrer" style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#1FA855', color: '#FFFFFF', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box' }}>
        <IconWhatsApp size={18} />{t('home.cs_cta')}
      </a>
    </section>
  )

  return (
    <div>
      {desktop ? null : <MainHeader />}
      {!desktop && (
        <>
          <Link to="/search" style={{ margin: '12px 16px 0', minHeight: 48, borderRadius: 24, background: 'var(--color-surface)', border: '1.5px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--color-text-2)', textDecoration: 'none', fontSize: 15 }}>
            <IconSearch size={20} />{t('search.placeholder')}
          </Link>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px 0' }}>
            {[t('strip.cs'), threshold > 0 ? t('strip.free_ship', { amount: money(threshold) }) : null, t('strip.pickup')].filter(Boolean).map((s) => (
              <span key={s} style={{ flex: 'none', padding: '6px 10px', borderRadius: 14, background: 'var(--color-bg-soft)', fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{s}</span>
            ))}
          </div>
        </>
      )}

      {desktop ? (
        <section style={{ display: 'grid', gridTemplateColumns: mods.live ? '1.4fr 1fr' : '1fr', gap: 24, padding: '32px 40px 0' }}>
          <Hero image={heroImage} desktop />
          {mods.live && <LiveArea data={mods.live.data} desktop />}
        </section>
      ) : <Hero image={heroImage} />}

      {!data && !error && (
        <div style={{ padding: '28px 0 0' }}><ProductGridSkeleton n={4} /></div>
      )}
      {error && <ErrorState title={t('common.error_generic')} onRetry={load} />}
      {data && order.map((k) => sections[k]?.())}
      {data && order.length === 0 && <div style={{ height: 8 }}><Skeleton h={0} /></div>}
      {data && cs}
      <Footer />
    </div>
  )
}
