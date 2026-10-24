import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHosts, img, onImgError, sized } from '../lib/api'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { storeHelpText, waUrl } from '../lib/wa'
import { whenLabel } from '../lib/when'
import { HostCard, LiveBadge, OffBadge } from '../components/HostCard'
import { IconArrowRight, IconCart, IconMenu, IconSearch } from '../components/Icons'
import { btnDark, btnOutline, EmptyState, ErrorState, iconBtn, PageHeader, Skeleton } from '../components/ui'

// brand red of the "View Host's Picks" button (client-specified, white text)
const HOST_PICKS_BG = '#9E1B46'

export default function Hosts() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const { settings } = useStore()
  const [all, setAll] = useState(null)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  useSeo({ title: t('hosts.title'), description: t('hosts.title'), canonical: '/hosts' })
  const load = useCallback(() => { setError(false); getHosts().then((d) => setAll(d.hosts || [])).catch(() => setError(true)) }, [])
  useEffect(() => { load() }, [load, i18n.language])

  const hosts = useMemo(() => {
    const text = q.trim().toLowerCase()
    return (all || []).filter((h) => (filter === 'all' || h.live_status === 'live') && (!text || h.name.toLowerCase().includes(text) || (h.alias || []).some((a) => a.toLowerCase().includes(text))))
  }, [all, q, filter])
  const liveCount = (all || []).filter((h) => h.live_status === 'live').length
  // typo help: hosts whose name shares most letters with the query
  const near = (all || []).filter((h) => q.trim() && [...q.trim().toLowerCase()].filter((c) => h.name.toLowerCase().includes(c)).length >= Math.ceil(q.trim().length * 0.6)).slice(0, 3)

  const sameDay = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString()
  const todayCount = (all || []).filter((h) => h.live_status === 'live' || sameDay(h.next_live_at)).length
  const pill = (on) => ({ flex: 'none', minHeight: 34, padding: '0 14px', borderRadius: 17, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })
  const shown = hosts.filter((h) => filter === 'today' ? (h.live_status === 'live' || sameDay(h.next_live_at)) : true)
  const groups = [...new Set(shown.map((h) => h.name[0]?.toUpperCase()))].sort().map((l) => [l, shown.filter((h) => h.name[0]?.toUpperCase() === l).sort((x, y) => x.name.localeCompare(y.name))])

  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('hosts.title')} to="/categories" height={58} gap={8} right={<><Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link><Link to="/menu" aria-label={t('menu.title')} style={iconBtn}><IconMenu /></Link></>} />
      <label style={{ margin: '12px 16px 0', minHeight: 50, borderRadius: 25, background: 'var(--color-surface)', border: '1.5px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--color-text-2)' }}>
        <IconSearch size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hosts.search')} aria-label={t('hosts.search_aria')} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--color-text)', fontFamily: 'inherit' }} />
      </label>
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, padding: '12px 16px 0', overflowX: 'auto' }}>
        <button type="button" onClick={() => setFilter('all')} style={pill(filter === 'all')}>{t('hosts.all', { n: (all || []).length })}</button>
        <button type="button" onClick={() => setFilter('live')} style={pill(filter === 'live')}>{t('hosts.live', { n: liveCount })}</button>
        <button type="button" onClick={() => setFilter('today')} style={pill(filter === 'today')}>{t('hosts.today')}</button>
      </div>

      {!all && !error && <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={240} r={16} />)}</div>}
      {error && <ErrorState title={t('hosts.load_fail')} text={t('hosts.load_fail_text')} onRetry={load} retryLabel={t('common.reload')} />}
      {all && hosts.length === 0 && (
        <EmptyState title={t('hosts.none_title', { q })} text={t('hosts.none_text')} action={
          <>
            {near.length > 0 && <span style={{ fontSize: 14 }}>{t('hosts.mean')} {near.map((h) => <Link key={h.id} to={`/hosts/${h.slug}`} style={{ marginLeft: 8, fontWeight: 700 }}>{h.name}</Link>)}</span>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => { setQ(''); setFilter('all') }} style={{ ...btnDark, height: 44, fontSize: 14 }}>{t('hosts.all_hosts')}</button>
              <a href={waUrl(settings.whatsapp_number, storeHelpText(i18n.language, 'host', q))} target="_blank" rel="noreferrer" style={{ ...btnOutline, height: 44, fontSize: 14 }}>{t('common.ask_cs')}</a>
            </div>
          </>} />
      )}

      {shown.some((h) => h.live_status === 'live') && (
        <section style={{ padding: '16px 0 0' }}>
          <div style={{ padding: '0 16px 10px' }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t('host.live_now')}</h2></div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>{shown.filter((h) => h.live_status === 'live').map((h) => <HostCard key={h.id} h={h} width={130} />)}</div>
        </section>
      )}

      <div style={{ padding: '4px 16px 0' }}>
        {groups.map(([letter, list]) => (
          <div key={letter}>
            <h2 id={`g${letter}`} style={{ margin: '16px 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{letter}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((h) => {
                const live = h.live_status === 'live'
                const pick = t('host.see_picks')
                return (
                  // horizontal card: photo left; name, next live, product count and a full-width "View Host's Picks" button right
                  <div key={h.id} style={{ display: 'flex', gap: 14, padding: 12, borderRadius: 20, background: 'var(--color-surface)', border: live ? '1.5px solid var(--color-live)' : '1px solid var(--color-border)' }}>
                    <Link to={`/hosts/${h.slug}`} aria-label={h.name} className={live ? 'live-pulse' : ''} style={{ position: 'relative', flex: 'none', width: 104, aspectRatio: '3 / 4', borderRadius: 16, overflow: 'hidden', display: 'block', border: live ? '2.5px solid var(--color-live)' : 'none', boxSizing: 'border-box' }}>
                      <img src={sized(img(h.avatar_url), 260)} alt={h.name} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 15%', background: 'var(--color-bg-soft)' }} />
                      {(live || !h.has_been_live) && <span style={{ position: 'absolute', left: 6, top: 6 }}>{live ? <LiveBadge text={t('host.live_now')} /> : <OffBadge />}</span>}
                    </Link>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                      <b style={{ fontSize: 20, lineHeight: 1.2 }}>{h.name}</b>
                      <span style={{ fontSize: 14, color: 'var(--color-text-2)' }}>
                        {live ? t('host.live_now') : h.next_live_at ? whenLabel(h.next_live_at, t, i18n.language) : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--color-text-2)' }}><IconCart size={16} />{t('host.products_count', { n: h.item_count })}</span>
                      <Link to={`/hosts/${h.slug}`} style={{ minHeight: 44, padding: '0 14px', borderRadius: 22, background: HOST_PICKS_BG, color: '#FFFFFF', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>{pick}<IconArrowRight size={14} /></Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
