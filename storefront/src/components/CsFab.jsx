import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconHeadset } from './Icons'

// Floating CS button (59px, WEB ADJ 036: 20% smaller than the first 74px) above the navigation (opens the CS center, which hands off to WhatsApp).
// The red "1" is CS's greeting ("Bingung ukuran? Bingung pesan?"): shown until the visitor opens the CS center once.
const SEEN = 'ralulu_cs_seen'
const TIP_OFF = 'ralulu_cs_tip_off' // the speech bubble was closed this session
export default function CsFab({ bottom = 108, oneLine = false, tip = '' }) {
  const { t } = useTranslation()
  const [seen, setSeen] = useState(() => { try { return Boolean(localStorage.getItem(SEEN)) } catch { return false } })
  const [tipOff, setTipOff] = useState(() => { try { return Boolean(sessionStorage.getItem(TIP_OFF)) } catch { return false } })
  const closeTip = (e) => { e.preventDefault(); e.stopPropagation(); setTipOff(true); try { sessionStorage.setItem(TIP_OFF, '1') } catch { /* ignore */ } }
  useEffect(() => { if (window.location.pathname === '/service') { try { localStorage.setItem(SEEN, '1') } catch { /* ignore */ } setSeen(true) } })
  return (
    <Link
      to="/service" aria-label={t('fab.aria')}
      style={{ position: 'fixed', right: 12, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, maxWidth: 'calc(100vw - 24px)', zIndex: 20, display: 'flex', alignItems: 'flex-end', gap: 8, textDecoration: 'none' }}
    >
      {!tipOff && <span className="cs-tip" role="button" tabIndex={0} aria-label={t('common.close')} onClick={closeTip} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeTip(e) }} style={{ position: 'relative', cursor: 'pointer', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'var(--color-surface)', color: 'var(--color-text)', boxShadow: '0 3px 14px rgba(20,40,38,0.22)', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--color-success)' }} />{t('fab.online')}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, ...(oneLine ? { whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } : { maxWidth: 190, whiteSpace: 'normal', lineHeight: 1.35 }) }}>{tip || t('fab.tip')}</span>
        <span aria-hidden style={{ position: 'absolute', top: -8, left: -8, width: 20, height: 20, borderRadius: 10, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 13, lineHeight: '20px', textAlign: 'center' }}>×</span>
      </span>}
      <span className="cs-shake" style={{ position: 'relative', width: 59, height: 59, borderRadius: 30, background: 'var(--color-primary)', border: '3px solid #FFFFFF', boxShadow: '0 6px 18px rgba(255,140,105,0.28)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-primary)' }}>
        <IconHeadset size={26} />
        <span style={{ fontSize: 9, fontWeight: 900, color: '#FFFFFF', letterSpacing: 1, lineHeight: 1.1 }}>CS</span>
        {!seen && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxSizing: 'content-box' }}>1</span>}
        <span style={{ position: 'absolute', bottom: 2, right: 2, width: 11, height: 11, borderRadius: 6, background: 'var(--color-success)', border: '2px solid #fff' }} />
      </span>
    </Link>
  )
}
