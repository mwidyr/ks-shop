import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { img, onImgError, sized } from '../lib/api'
import { IconPlay } from './Icons'

export function LiveBadge({ text }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 900, letterSpacing: '.5px' }}>
      <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--color-bg)' }} />{text}
    </span>
  )
}

// Black "OFF" tag for a host who has never gone live. A host who has been live before shows the plain
// photo with no status tag, and a live host keeps the red ring + LIVE NOW (LiveBadge).
export function OffBadge() {
  return <span style={{ padding: '3px 8px', borderRadius: 6, background: '#000000', color: '#FFFFFF', fontSize: 11, fontWeight: 700, letterSpacing: '.5px' }}>OFF</span>
}

// Host tile (150px) for the home / hosts scrollers: live ring, or the OFF tag / plain photo.
export function HostCard({ h, width = 150, wearing }) {
  const { t } = useTranslation()
  const live = h.live_status === 'live'
  return (
    <Link to={`/hosts/${h.slug}`} style={{ flex: 'none', width, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', color: 'var(--color-text)' }}>
      <span className={live ? 'live-pulse' : ''} style={{ position: 'relative', display: 'block', aspectRatio: '150 / 202', borderRadius: 16, overflow: 'hidden', border: live ? '2.5px solid var(--color-live)' : '1px solid var(--color-border)', boxSizing: 'border-box', background: 'var(--color-bg-soft)' }}>
        <img src={sized(img(h.avatar_url), 400)} alt={h.name} loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 15%' }} />
        {(live || !h.has_been_live) && (
          <span style={{ position: 'absolute', top: 8, left: 8 }}>{live ? <LiveBadge text={t('host.live_now')} /> : <OffBadge />}</span>
        )}
        {(wearing || h.wearing_image) && (
          <span style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px', borderRadius: 12, background: 'rgba(255,255,255,0.94)' }}>
            <img src={sized(img(wearing || h.wearing_image), 80)} alt="" onError={onImgError} style={{ width: 26, height: 32, borderRadius: 6, objectFit: 'cover' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)' }}>{t('host.wearing')}</span>
          </span>
        )}
      </span>
      <b style={{ fontSize: 15 }}>{h.name}</b>
      {live ? (
        <span style={{ height: 34, borderRadius: 17, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><IconPlay size={10} />{t('host.enter_live')}</span>
      ) : (
        <span style={{ height: 34, borderRadius: 17, border: '1.5px solid var(--color-text)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('host.see_outfit')}</span>
      )}
    </Link>
  )
}
