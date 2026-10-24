import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getLive, img, onImgError, sized } from '../lib/api'
import { useSeo } from '../lib/seo'
import { liveDateParts } from '../lib/when'
import { IconPlay } from '../components/Icons'
import { LiveBadge } from '../components/HostCard'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'

export const LIVE_REFRESH_MS = 60000

// LIVE page: only who is live right now (with a button to our TikTok LIVE) and the upcoming schedule.
// Status and times come from the schedule set in the admin (Taiwan time); the TikTok address is never printed.
export default function Live() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const [d, setD] = useState(null)
  const [error, setError] = useState(false)
  useSeo({ title: t('live.title'), description: t('live.title'), canonical: '/live' })
  const load = useCallback(() => { setError(false); getLive().then(setD).catch(() => setError(true)) }, [])
  useEffect(() => { load() }, [load, i18n.language])
  // the page can stay open across a session start or end
  useEffect(() => {
    const id = setInterval(() => { getLive().then(setD).catch(() => {}) }, LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const px = desktop ? 40 : 16
  if (error) return <div><PageHeader title={t('live.title')} /><ErrorState onRetry={load} /></div>
  if (!d) return <div><PageHeader title={t('live.title')} /><Skeleton h={260} r={0} /></div>
  const h2 = { margin: 0, fontSize: 17, fontWeight: 900 }
  const avatar = (host, size) => <img src={sized(img(host.avatar_url), size * 3)} alt={host.name} loading="lazy" onError={onImgError} style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', objectPosition: '50% 15%', background: 'var(--color-bg-soft)', flex: 'none' }} />

  return (
    <div style={{ paddingBottom: 130, maxWidth: desktop ? 820 : 'none', margin: desktop ? '0 auto' : 0 }}>
      <PageHeader title={t('live.title')} to="/" />

      <section style={{ margin: `18px ${px}px 0` }} aria-label={t('live.now')}>
        <h2 style={{ ...h2, marginBottom: 12 }}>{t('live.now')}</h2>
        {d.live.length === 0 ? (
          <EmptyState title={t('live.none')} text={t('live.none_text')} />
        ) : (
          // Phone: always 2 columns (up to 15 hosts can be live at once, so cards stay compact: portrait photo,
          // name + button over the bottom edge). Desktop: as many 260px+ cards as fit.
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(260px, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: desktop ? 14 : 10 }}>
            {d.live.map((host) => (
              <div key={host.id} className="live-pulse" style={{ position: 'relative', ...(desktop ? { height: 420 } : { aspectRatio: '3 / 4' }), borderRadius: desktop ? 20 : 16, overflow: 'hidden', border: `${desktop ? 3 : 2.5}px solid var(--color-live)`, boxSizing: 'border-box', background: 'var(--color-text)', color: '#FFFFFF' }}>
                <img src={sized(img(host.avatar_url), desktop ? 800 : 500)} alt={host.name} loading="lazy" onError={onImgError} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 20%' }} />
                <span style={{ position: 'absolute', top: desktop ? 12 : 8, left: desktop ? 12 : 8 }}><LiveBadge text={t('host.live_now')} /></span>
                <Link to={`/hosts/${host.slug}`} style={desktop
                  ? { position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 4px 4px', borderRadius: 20, background: 'rgba(0,0,0,0.55)', color: '#FFFFFF', textDecoration: 'none', fontSize: 13, fontWeight: 700 }
                  : { position: 'absolute', left: 8, right: 8, bottom: host.watch_url ? 52 : 8, display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 3px', borderRadius: 16, background: 'rgba(0,0,0,0.55)', color: '#FFFFFF', textDecoration: 'none', fontSize: 13, fontWeight: 700, minWidth: 0 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', border: '2px solid var(--color-live)', display: 'flex', flex: 'none' }}>{avatar(host, 24)}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host.name}</span>
                </Link>
                {host.watch_url && (
                  <a href={host.watch_url} target="_blank" rel="noreferrer" style={{ position: 'absolute', left: desktop ? 12 : 8, right: desktop ? 12 : 8, bottom: desktop ? 14 : 8, height: desktop ? 56 : 38, borderRadius: desktop ? 14 : 12, background: 'var(--color-live)', color: '#FFFFFF', fontSize: desktop ? 17 : 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: desktop ? 8 : 6, textDecoration: 'none' }}>
                    <IconPlay size={desktop ? 14 : 12} />{t('live.watch')}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ margin: `26px ${px}px 0` }} aria-label={t('live.schedule')}>
        <h2 style={{ ...h2, marginBottom: 12 }}>{t('live.schedule')}</h2>
        {d.scheduled.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-2)' }}>{t('live.schedule_empty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.scheduled.map((host) => {
              const when = liveDateParts(host.next_live_at, i18n.language)
              return (
                <Link key={host.id} to={`/hosts/${host.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
                  <span style={{ flex: 'none', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <b style={{ fontSize: 12, color: 'var(--color-live)', textAlign: 'center' }}>{when.date}</b>
                    <b style={{ fontSize: 17 }}>{when.time}</b>
                  </span>
                  <b style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host.name}</b>
                  {avatar(host, 44)}
                </Link>
              )
            })}
          </div>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-text-3)' }}>{t('live.tz_note')}</p>
      </section>
    </div>
  )
}
