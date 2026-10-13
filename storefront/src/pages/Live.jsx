import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { claimCoupon, getLive, img, onImgError, sized } from '../lib/api'
import { saveClaimed } from '../lib/claimed'
import { downloadLiveReminder } from '../lib/ics'
import { duration, formatNumber, money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { whenLabel } from '../lib/when'
import { IconPlay } from '../components/Icons'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'

const h2 = (size, weight = 900) => ({ margin: 0, fontSize: size, fontWeight: weight })

// Live room (artboard Live): the live preview with the product being shown, perk coupon, live products, schedule, hosts, replays.
export default function Live() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const { settings } = useStore()
  const [d, setD] = useState(null)
  const [error, setError] = useState(false)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  useSeo({ title: t('live.title'), description: t('live.title'), canonical: '/live' })
  const load = useCallback(() => { setError(false); getLive().then(setD).catch(() => setError(true)) }, [])
  useEffect(() => { load() }, [load, i18n.language])

  async function claim() {
    try { const p = await claimCoupon(code.trim()); saveClaimed(p); setMsg({ ok: true, text: t('live.claimed', { code: p.code }) }); setCode('') } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  const px = desktop ? 40 : 16
  if (error) return <div><PageHeader title={t('live.title')} /><ErrorState onRetry={load} /></div>
  if (!d) return <div><PageHeader title={t('live.title')} /><Skeleton h={260} r={0} /></div>
  const main = d.live[0]
  const showing = d.products[0]
  const social = settings.social || {}
  const sites = [['Facebook', social.facebook], ['YouTube', social.youtube]].filter(([, u]) => u)
  const avatarOf = (slug) => d.hosts.find((h) => h.slug === slug)?.avatar_url || ''
  const sub = { fontSize: 12, color: 'var(--color-text-2)' }
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('live.title')} to="/" />
      {main ? (
        <section style={{ margin: `12px ${px}px 0` }}>
          <a href={main.watch_url || '#'} target="_blank" rel="noreferrer" className="live-pulse" style={{ display: 'block', position: 'relative', height: 560, borderRadius: 20, overflow: 'hidden', border: '3px solid var(--color-live)', textDecoration: 'none', color: '#FFFFFF', background: 'var(--color-text)' }}>
            <img src={sized(img(main.avatar_url), 900)} alt={main.name} fetchpriority="high" onError={onImgError} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 20%' }} />
            <span style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'var(--color-live)', fontSize: 13, fontWeight: 900, letterSpacing: 1, color: '#FFFFFF' }}><span className="live-dot" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--color-surface)' }} />LIVE {t('live.now')}</span>
              {main.viewer_count != null && <span style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 700 }}>{t('host.viewers', { n: formatNumber(main.viewer_count) })}</span>}
            </span>
            <span style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', borderRadius: 20, background: 'rgba(0,0,0,0.55)' }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', border: '2px solid var(--color-live)', boxSizing: 'content-box' }}><img src={sized(img(main.avatar_url), 80)} alt="" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} /></span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{main.name}</span>
            </span>
            {showing && (
              <span style={{ position: 'absolute', left: 12, right: 12, bottom: 84, display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.95)', color: 'var(--color-text)' }}>
                <img src={sized(img(showing.image), 120)} alt={showing.name} onError={onImgError} style={{ width: 46, height: 60, borderRadius: 8, objectFit: 'cover', flex: 'none' }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-live)' }}>{t('live.host_wears')}{showing.live_code ? ` #${showing.live_code}` : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{showing.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{t('common.price_live', { price: money(showing.price) })}</span>
                </span>
                <Link to={`/p/${showing.id}`} onClick={(e) => e.stopPropagation()} style={{ flex: 'none', padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>{t('live.buy')}</Link>
              </span>
            )}
            <span style={{ position: 'absolute', left: 12, right: 12, bottom: 14, height: 56, borderRadius: 14, background: 'var(--color-live)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, fontWeight: 900, color: '#FFFFFF' }}><IconPlay size={16} />{t('live.watch_in')}</span>
          </a>
          {sites.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--color-text-2)', alignItems: 'center' }}>{t('live.also')}
              {sites.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontWeight: 700, textDecoration: 'none' }}>{n}</a>)}
            </div>
          )}
        </section>
      ) : (
        <EmptyState title={t('live.none')} text={t('live.none_text')} />
      )}

      {d.coupon?.code && (
        <section style={{ margin: `16px ${px}px 0`, borderRadius: 18, background: 'var(--color-coupon-bg)', border: '2px dashed var(--color-secondary)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('live.perk_title')}</span><span style={{ fontSize: 26, fontWeight: 900, color: 'var(--color-text)' }}>{t('live.perk', { amount: money(d.coupon.value) })}</span></span>
            <span style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 12, fontWeight: 900 }}>{t('live.perk_today')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, fontSize: 12, color: 'var(--color-text)', textAlign: 'center' }}>
            {['s1', 's2', 's3'].map((k, i) => <span key={k} style={{ padding: '8px 4px', borderRadius: 10, background: 'var(--color-surface)' }}><b style={{ display: 'block', fontSize: 15 }}>{i + 1}</b>{t(`live.${k}`)}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, height: 46, borderRadius: 12, background: 'var(--color-surface)', border: '1.5px solid var(--color-secondary)', display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'content-box' }}><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('live.claim_ph')} aria-label={t('live.code_label')} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 15, background: 'transparent', fontFamily: 'inherit' }} /></label>
            <button type="button" onClick={claim} style={{ height: 46, padding: '0 18px', borderRadius: 12, border: 'none', background: 'var(--color-text)', fontSize: 15, fontWeight: 900, color: '#FFFFFF', fontFamily: 'inherit', cursor: 'pointer' }}>{t('live.claim')}</button>
          </div>
          {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: msg.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{msg.text}</span>}
        </section>
      )}

      {d.products.length > 0 && (
        <section style={{ padding: '22px 0 0' }}>
          <h2 style={{ ...h2(17), margin: `0 ${px}px 10px` }}>{t('live.products')}</h2>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: `0 ${px}px` }}>
            {d.products.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} style={{ flex: 'none', width: 120, display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--color-text)' }}>
                <span style={{ position: 'relative', height: 160, borderRadius: 12, overflow: 'hidden', display: 'block' }}>
                  <img src={sized(img(p.image), 240)} alt={p.name} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {p.live_code && <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 4, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>#{p.live_code}</span>}
                </span>
                <span style={{ fontSize: 12, height: 32, overflow: 'hidden', lineHeight: 1.35 }}>{p.name}</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--color-live)' }}>{t('common.price_live', { price: money(p.price) })}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.scheduled.length > 0 && (
        <section style={{ margin: `22px ${px}px 0` }}>
          <h2 style={{ ...h2(17), marginBottom: 10 }}>{t('live.schedule')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.scheduled.map((h) => {
              const when = whenLabel(h.next_live_at, t, i18n.language)
              const [day, time] = when.includes(' ') ? [when.slice(0, when.lastIndexOf(' ')), when.slice(when.lastIndexOf(' ') + 1)] : [when, '']
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <span style={{ flex: 'none', width: 56, display: 'flex', flexDirection: 'column', alignItems: 'center' }}><b style={{ fontSize: 13, color: 'var(--color-live)' }}>{day.charAt(0).toUpperCase() + day.slice(1)}</b><b style={{ fontSize: 17 }}>{time}</b></span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{h.next_live_title || h.name}</b><span style={sub}>{h.name}{d.coupon?.code ? `・${t('live.perk_line', { amount: money(d.coupon.value) })}` : ''}</span></span>
                  <button type="button" onClick={() => downloadLiveReminder({ title: `${h.name} live`, startIso: h.next_live_at, url: h.watch_url })} style={{ flex: 'none', height: 36, padding: '0 12px', borderRadius: 18, border: '1.5px solid var(--color-primary-strong)', background: 'var(--color-surface)', color: 'var(--color-primary-strong)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'content-box' }}>{t('live.remind')}</button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {d.hosts.length > 0 && (
        <section style={{ margin: `22px ${px}px 0` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={h2(15, 700)}>{t('live.hosts')}</h2><Link to="/hosts" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-text)' }}>{t('live.all')}</Link></div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 14, marginTop: 12, overflowX: 'auto' }}>
            {d.hosts.slice(0, 8).map((h) => {
              const live = h.live_status === 'live'
              return (
                <Link key={h.id} to={`/hosts/${h.slug}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--color-text)' }}>
                  <span style={{ position: 'relative', width: 68, height: 68, borderRadius: 34, overflow: 'hidden', border: `3px solid ${live ? 'var(--color-live)' : 'var(--color-border)'}`, boxSizing: 'border-box' }}><img src={sized(img(h.avatar_url), 160)} alt={h.name} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} /></span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: live ? 'var(--color-live)' : 'var(--color-text-2)', fontWeight: 700 }}>{live ? `● ${t('live.now')}` : h.next_live_at ? whenLabel(h.next_live_at, t, i18n.language) : ''}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {d.replays.length > 0 && (
        <section style={{ margin: `22px ${px}px 0` }}>
          <h2 style={{ ...h2(17), marginBottom: 10 }}>{t('live.replays')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {d.replays.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none', color: 'var(--color-text)' }}>
                <span style={{ position: 'relative', height: 230, borderRadius: 14, overflow: 'hidden', display: 'block' }}>
                  <img src={sized(img(avatarOf(r.host_slug)), 400)} alt={r.title} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconPlay size={18} /></span></span>
                  {r.duration_sec != null && <span style={{ position: 'absolute', right: 8, bottom: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: 11 }}>{duration(r.duration_sec)}</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{r.title} | {r.host_name}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
