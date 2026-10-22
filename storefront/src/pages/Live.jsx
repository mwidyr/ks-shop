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
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(260px, 1fr))' : 'minmax(0, 1fr)', gap: 14 }}>
            {d.live.map((host) => (
              <div key={host.id} className="live-pulse" style={{ position: 'relative', height: desktop ? 420 : 460, borderRadius: 20, overflow: 'hidden', border: '3px solid var(--color-live)', background: 'var(--color-text)', color: '#FFFFFF' }}>
                <img src={sized(img(host.avatar_url), 800)} alt={host.name} onError={onImgError} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 20%' }} />
                <span style={{ position: 'absolute', top: 12, left: 12 }}><LiveBadge text={t('host.live_now')} /></span>
                <Link to={`/hosts/${host.slug}`} style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 4px 4px', borderRadius: 20, background: 'rgba(0,0,0,0.55)', color: '#FFFFFF', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', border: '2px solid var(--color-live)', display: 'flex' }}>{avatar(host, 24)}</span>
                  {host.name}
                </Link>
                {host.watch_url && (
                  <a href={host.watch_url} target="_blank" rel="noreferrer" style={{ position: 'absolute', left: 12, right: 12, bottom: 14, height: 56, borderRadius: 14, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 17, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                    <IconPlay size={14} />{t('live.watch')}
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
