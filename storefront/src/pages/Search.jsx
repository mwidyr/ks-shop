import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { img, onImgError, searchAll, sized } from '../lib/api'
import { formatNumber, fullDate, money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { HostCard, LiveBadge } from '../components/HostCard'
import { IconBack, IconSearch } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { EmptyState, ErrorState, iconBtn, ProductGridSkeleton } from '../components/ui'

// One query -> hosts + products + articles. "RARA" finds the host and what she wore; a product word
// finds products and the hosts who wore them.
export default function Search() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')
  const [tab, setTab] = useState('all')
  const timer = useRef(null)
  useSeo({ title: t('search.title'), noindex: true })

  useEffect(() => {
    clearTimeout(timer.current)
    const text = q.trim()
    if (!text) { setData(null); setState('idle'); return undefined }
    setState('loading')
    timer.current = setTimeout(() => {
      searchAll(text).then((d) => { setData(d); setState('ok'); setSp({ q: text }, { replace: true }) }).catch(() => setState('error'))
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q, i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const hosts = data?.hosts || []
  const products = data?.products || []
  const articles = data?.articles || []
  const hostsFor = data?.hosts_for_products || []
  const none = state === 'ok' && !hosts.length && !products.length && !articles.length

  const first = hosts[0]
  const liveProducts = data?.live_products || []
  const wornSet = new Set(data?.worn_ids || [])
  const text = q.trim()
  const suggestions = state === 'ok' ? (data?.suggestions || []).slice(0, 2).map((sg) => { const host = hosts.some((h) => h.name === sg); return { raw: sg, host, label: host ? sg : sg.split(/\s+/).slice(0, 2).join(' ') } }) : []
  const bold = (sg) => { const n = text.length; return sg.toLowerCase().startsWith(text.toLowerCase()) ? <><b>{sg.slice(0, n)}</b>{sg.slice(n)}</> : sg }
  const sTitle = (txt) => ({ margin: '0 0 10px', fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'var(--color-primary-strong)' })
  const lens = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
  const pill = (on) => ({ minHeight: 34, padding: '0 14px', borderRadius: 17, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })

  return (
    <div style={{ paddingBottom: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 8px 4px', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)' }}>
        <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconBack /></button>
        <label style={{ flex: 1, minHeight: 48, borderRadius: 24, border: '2px solid var(--color-primary-strong)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--color-text-2)' }}>
          <IconSearch size={18} />
          <input type="search" autoFocus={!sp.get('q')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder_input')} aria-label={t('search.title')} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--color-text)', fontFamily: 'inherit' }} />
        </label>
      </div>

      {state === 'idle' && <p style={{ padding: 24, fontSize: 14, color: 'var(--color-text-2)', lineHeight: 1.7 }}>{t('search.hint')}</p>}
      {state === 'loading' && <div style={{ paddingTop: 16 }}><ProductGridSkeleton n={4} /></div>}
      {state === 'error' && <ErrorState title={t('search.error')} onRetry={() => setQ((x) => x + ' ')} />}
      {none && <EmptyState title={t('search.none_title', { q: text })} text={t('search.none_text')} action={<Link to="/service" style={{ color: 'var(--color-primary-strong)', fontWeight: 700 }}>{t('common.ask_cs')}</Link>} />}

      {state === 'ok' && !none && (
        <>
          {suggestions.length > 0 && (
            <div style={{ padding: '4px 16px', borderBottom: '1px solid var(--color-border)' }}>
              {suggestions.map((sg) => (
                <a key={sg.raw} href={`/search?q=${encodeURIComponent(sg.raw)}`} onClick={(e) => { e.preventDefault(); setQ(sg.raw) }} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, textDecoration: 'none', color: 'var(--color-text)', fontSize: 15 }}>
                  {lens}<span>{bold(sg.label)}{sg.host ? `・${t('search.host')}` : first ? ` ${t('search.worn_by', { name: first.name })}` : ''}</span>
                </a>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
            <button type="button" onClick={() => setTab('all')} style={pill(tab === 'all')}>{t('search.tabs_all')}</button>
            <button type="button" onClick={() => setTab('host')} style={pill(tab === 'host')}>{t('search.tabs_host', { n: hosts.length })}</button>
            <button type="button" onClick={() => setTab('product')} style={pill(tab === 'product')}>{t('search.tabs_product', { n: products.length })}</button>
          </div>

          {(tab === 'all' || tab === 'host') && hosts.length > 0 && (
            <section style={{ padding: '16px 16px 0' }}>
              <h2 style={sTitle()}>{t('search.host')}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hosts.map((h) => {
                const live = h.live_status === 'live'
                return (
                  <Link key={h.id} to={`/hosts/${h.slug}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 18, background: 'var(--color-surface)', border: live ? '1.5px solid var(--color-live)' : '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
                    <span className={live ? 'live-pulse' : ''} style={{ position: 'relative', flex: 'none', width: 64, height: 64, borderRadius: 32, overflow: 'hidden', border: live ? '2.5px solid var(--color-live)' : '1px solid var(--color-border)', boxSizing: 'border-box' }}>
                      <img src={sized(img(h.avatar_url), 120)} alt={h.name} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} />
                    </span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <b style={{ fontSize: 17 }}>{h.name}</b>
                      {live && <span style={{ display: 'flex' }}><LiveBadge text={t('search.live_now')} /></span>}
                      <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{live ? [h.live_title, h.viewer_count != null ? t('host.viewers', { n: formatNumber(h.viewer_count) }) : ''].filter(Boolean).join('・') : h.live_title || ''}</span>
                    </span>
                    <span style={{ flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 20, background: live ? 'var(--color-live)' : 'var(--color-surface)', border: live ? 'none' : '1.5px solid var(--color-text)', color: live ? '#FFFFFF' : 'var(--color-text)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{live ? t('search.enter_live') : t('search.see_outfit')}</span>
                  </Link>
                )
              })}
              </div>
            </section>
          )}

          {tab === 'all' && first && liveProducts.length > 0 && (
            <section style={{ padding: '20px 0 0' }}>
              <div style={{ padding: '0 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <h2 style={{ ...sTitle(), margin: 0 }}>{t('search.showing_by', { name: first.name })}</h2>
                <Link to={`/hosts/${first.slug}`} style={{ fontSize: 13, color: 'var(--color-primary-strong)' }}>{t('search.see_all')}</Link>
              </div>
              <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>
                {liveProducts.map((p) => (
                  <Link key={p.id} to={`/p/${p.id}`} style={{ flex: 'none', width: 136, display: 'flex', flexDirection: 'column', gap: 5, textDecoration: 'none', color: 'var(--color-text)' }}>
                    <span style={{ position: 'relative', display: 'block', aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'var(--color-bg-soft)' }}>
                      <img src={sized(img(p.image), 280)} alt={p.name} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {p.is_live && <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 6, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{t('search.on_live')}</span>}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1.4, height: 36, overflow: 'hidden' }}>{p.name}</span>
                    <b style={{ fontSize: 15 }}>{money(p.price)}</b>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'product') && products.length > 0 && (
            <section style={{ padding: '20px 16px 0' }}>
              <h2 style={sTitle()}>{first ? t('search.products_of', { name: first.name }) : t('search.tabs_product', { n: products.length })}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px 12px' }}>
                {products.map((p) => <ProductCard key={p.id} p={p} badgeKind={first && wornSet.has(p.id) ? 'worn' : undefined} badgeText={first ? t('search.worn', { name: first.name }) : ''} />)}
              </div>
            </section>
          )}

          {tab === 'all' && hostsFor.length > 0 && (
            <section style={{ padding: '24px 0 0' }}>
              <h2 style={{ ...sTitle(), margin: '0 16px 10px' }}>{t('search.hosts_wore')}</h2>
              <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>{hostsFor.map((h) => <HostCard key={h.id} h={h} width={132} />)}</div>
            </section>
          )}

          {tab === 'all' && articles.length > 0 && (
            <section style={{ padding: '20px 16px 0' }}>
              <h2 style={{ ...sTitle(), margin: '0 0 6px' }}>{first ? t('search.articles_of', { name: first.name }) : t('search.articles')}</h2>
              {articles.map((a) => (
                <Link key={a.id} to={a.path || (a.type === 'host_article' ? `/hosts/${a.author_slug}/journal/${a.slug}` : `/style/${a.slug}`)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
                  <img src={sized(img(a.cover_url), 160)} alt="" onError={onImgError} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />
                  <b style={{ fontSize: 15, lineHeight: 1.45 }}>{a.title}</b>
                </Link>
              ))}
            </section>
          )}
        </>
      )}
      <span hidden>{fullDate(0)}</span>
    </div>
  )
}
