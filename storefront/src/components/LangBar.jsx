import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LANGS } from '../lib/lang'
import { changeLang } from '../i18n'
import { IconCheck, IconGlobe } from './Icons'

const SAYS = { id: 'Ganti bahasa →', en: 'Change language →', zh: '切換語言 →' }

// 46px strip at the very top: a globe button (all languages) + a marquee that offers each language
// in its own words. Pauses on hover; stops entirely under reduced motion.
export default function LangBar() {
  const { t, i18n } = useTranslation()
  const cur = i18n.language
  const row = (hidden) => (
    <div aria-hidden={hidden || undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 10 }}>
      {LANGS.map((l) => {
        const on = l.code === cur
        return (
          <span key={l.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 'none', fontSize: 12, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>{SAYS[l.code]}</span>
            <button
              type="button" tabIndex={hidden ? -1 : 0} onClick={() => changeLang(l.code)}
              style={{
                flex: 'none', height: 30, padding: '0 12px', borderRadius: 15, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                boxSizing: 'border-box', border: on ? 'none' : '1.5px solid var(--color-secondary)',
                background: on ? 'var(--color-primary)' : 'var(--color-surface)', color: on ? 'var(--color-on-primary)' : 'var(--color-text)',
              }}
            >
              {on && <IconCheck size={11} strokeWidth={3.4} />}{l.short}
            </button>
            <span style={{ flex: 'none', width: 12 }} />
          </span>
        )
      })}
    </div>
  )
  return (
    <div aria-label={t('lang.aria')} style={{ height: 46, background: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative', zIndex: 5 }}>
      <Link to="/language" aria-label={t('lang.all')} style={{ flex: 'none', height: 46, padding: '0 10px 0 12px', display: 'flex', alignItems: 'center', background: 'var(--color-bg-soft)', boxShadow: '8px 0 10px -6px rgba(30,30,35,0.3)', position: 'relative', zIndex: 1 }}>
        <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconGlobe size={16} />
        </span>
      </Link>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div className="lang-track">{row(false)}{row(true)}</div>
      </div>
    </div>
  )
}
