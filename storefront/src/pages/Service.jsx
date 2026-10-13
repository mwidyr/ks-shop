import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { topicText, waUrl } from '../lib/wa'
import WaSheet from '../components/WaSheet'

const WA_ICON = (size, stroke = '#FFFFFF') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c.3 2 1.8 3.8 4.3 4.6l1.2-1.1 1.8.8-.4 1.6c-3.6.2-7-3-7.2-6.6l1.6-.5.8 1.8z" /></svg>
)
const TOPICS = ['order', 'size', 'store', 'status', 'return', 'other']

// CS center: every button hands off to WhatsApp with the question already filled in.
export default function Service() {
  const { t, i18n } = useTranslation()
  const { settings, threshold, chainFee } = useStore()
  const [preview, setPreview] = useState(null)
  useSeo({ title: t('service.title'), description: t('service.intro'), canonical: '/service' })
  const lang = i18n.language
  const wa = (key) => waUrl(settings.whatsapp_number, topicText(lang, key))
  const faq = [
    [t('service.q1'), t('service.a1')], [t('service.q2'), t('service.a2')],
    [t('service.q3'), t('service.a3', { fee: money(chainFee('cvs_711') || 60), min: money(threshold) })], [t('service.q4'), t('service.a4')],
  ]
  return (
    <div style={{ paddingBottom: 130 }}>
      <header style={{ padding: 16, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ position: 'relative', width: 52, height: 52, borderRadius: 26, background: 'var(--color-bg)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9.5" r="3.6" /><path d="M5.5 21c1.1-3.4 3.6-5.2 6.5-5.2s5.4 1.8 6.5 5.2" /><path d="M6.2 10a5.8 5.8 0 0 1 11.6 0" /><rect x="4.6" y="9.2" width="2.4" height="3.6" rx="1.2" fill="currentColor" /><rect x="17" y="9.2" width="2.4" height="3.6" rx="1.2" fill="currentColor" /><path d="M18.2 12.8v1.2a2 2 0 0 1-2 2H14" /></svg>
            <span style={{ position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, background: 'var(--color-success)', border: '2px solid var(--color-bg)', color: '#FFFFFF' }} />
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('service.title')}</h1>
            <span style={{ fontSize: 13, color: 'var(--color-border)' }}>{t('service.online')}</span>
          </span>
        </div>
        <span style={{ fontSize: 15, lineHeight: 1.6 }}>{t('service.intro')}</span>
        <a href={wa('other')} target="_blank" rel="noreferrer" style={{ minHeight: 54, borderRadius: 27, background: '#1FA855', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>{WA_ICON(22)}{t('service.open_wa')}</a>
      </header>
      <section style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>{t('service.ask_what')}</h2>
        <span style={{ marginTop: -6, fontSize: 13, color: 'var(--color-text-2)' }}>{t('service.ask_hint')}</span>
        {TOPICS.map((k) => (
          <a key={k} href={wa(k)} onClick={(e) => { e.preventDefault(); setPreview(k) }} style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t(`service.t_${k}`)}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t(`service.t_${k}_s`)}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#1FA855' }}>{WA_ICON(16, '#1FA855')}WhatsApp ›</span>
          </a>
        ))}
      </section>
      <section style={{ margin: '18px 16px 0', padding: 14, borderRadius: 16, background: 'var(--color-primary-soft)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ fontSize: 15 }}>{t('service.hours')}</b>
        <span>{settings.cs_hours || t('service.hours_default')}・{t('service.after_live')}</span>
        <span style={{ color: 'var(--color-text)' }}>{settings.cs_hours_note || t('service.hours_note')}</span>
      </section>
      <section style={{ padding: '18px 16px 0' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>{t('service.faq')}</h2>
        {faq.map(([q, a]) => (
          <details key={q} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center', fontSize: 15, cursor: 'pointer' }}>{q}</summary>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{a}</p>
          </details>
        ))}
      </section>
      <WaSheet open={Boolean(preview)} onClose={() => setPreview(null)} message={preview ? topicText(lang, preview) : ''} url={preview ? wa(preview) : ''} number={settings.whatsapp_number} />
    </div>
  )
}
