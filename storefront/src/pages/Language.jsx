import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { changeLang } from '../i18n'
import { img, onImgError } from '../lib/api'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'

// Language picker: the artboard's first-visit sheet (detected-language toast on a dimmed page). Vietnamese / Tagalog are announced, not selectable yet.
const OPTIONS = [
  { code: 'id', label: 'ID', native: 'Bahasa Indonesia', sub: 'Bahasa Indonesia・bahasa HP' },
  { code: 'zh', label: '中', native: '繁體中文', sub: '中文' },
  { code: 'en', label: 'EN', native: 'English', sub: 'English' },
  { code: 'vi', label: 'VI', native: 'Tiếng Việt', sub: 'Tiếng Việt・Segera hadir', soon: true },
  { code: 'tl', label: 'TL', native: 'Tagalog', sub: 'Tagalog・Segera hadir', soon: true },
]
const NAMES = { id: 'Bahasa Indonesia', zh: '繁體中文', en: 'English' }

export default function Language() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useStore()
  useSeo({ title: t('lang.title'), noindex: true })
  const cur = i18n.language
  const [before, after] = t('lang.using', { name: '\u0001' }).split('\u0001')
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lang-t" style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--color-bg)', overflow: 'hidden' }}>
      {settings?.splash_url ? <img src={img(settings.splash_url)} alt="" onError={onImgError} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(30,22,26,0.55)' }} />
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, maxWidth: 528, margin: '0 auto', padding: '12px 14px', borderRadius: 14, background: 'var(--color-surface)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box' }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--color-primary-soft)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
        </span>
        <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>{before}<b>{NAMES[cur] || NAMES.id}</b>{after}<br /><span style={{ color: 'var(--color-text-2)' }}>{t('lang.auto')}</span></span>
        <a href="#lang-list" onClick={(e) => { e.preventDefault(); document.getElementById('lang-list')?.focus() }} style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--color-primary-strong)' }}>{t('lang.change')}</a>
      </div>
      <section id="lang-list" tabIndex={-1} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, margin: '0 auto', background: 'var(--color-surface)', borderRadius: '22px 22px 0 0', padding: '10px 16px 28px', display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box', outline: 'none' }}>
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: 'var(--color-border)', marginBottom: 8 }} />
        <h1 id="lang-t" style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Bahasa・Bahasa・Ngôn ngữ・Wika・Language</h1>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-2)' }}>Pilih bahasa ・ Chọn ngôn ngữ ・ Pumili ng wika ・ 選擇語言</p>
        {OPTIONS.map((l) => {
          const on = l.code === cur
          return (
            <button key={l.code} type="button" disabled={l.soon} aria-pressed={on} onClick={() => { changeLang(l.code); close() }}
              style={{ height: 60, padding: '0 14px', borderRadius: 14, border: on ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: on ? 'var(--color-bg-soft)' : 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'var(--color-text)', boxSizing: 'content-box', font: 'inherit', cursor: l.soon ? 'default' : 'pointer' }}>
              <span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{l.label}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 15, fontWeight: 700 }}>{l.native}</span><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{l.sub}</span></span>
              {on && <span style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg></span>}
            </button>
          )
        })}
      </section>
    </div>
  )
}
