import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { greetingText } from '../lib/wa'
import { csChannels } from '../lib/cs'

// CS center: one button per chat app (WhatsApp, LINE ...), each opening the chat with the general greeting filled in.
export default function Service() {
  const { t } = useTranslation()
  const { settings } = useStore()
  useSeo({ title: t('service.title'), description: t('service.intro'), canonical: '/service' })
  const channels = csChannels(settings, greetingText())
  const faq = [1, 2, 3, 4, 5, 6].map((n) => [t(`service.q${n}`), t(`service.a${n}`)])
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
        {channels.map(({ key, label, color, Icon, url }) => (
          <a key={key} data-testid={`service-${key}`} href={url} target="_blank" rel="noreferrer" style={{ minHeight: 54, borderRadius: 27, background: color, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}><Icon size={22} stroke="#FFFFFF" />{t('cs.open_service', { app: label })}</a>
        ))}
        {channels.length === 0 && <span role="status" style={{ fontSize: 13 }}>{t('final.no_channel')}</span>}
      </header>
      <section style={{ margin: '18px 16px 0', padding: 14, borderRadius: 16, background: 'var(--color-primary-soft)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ fontSize: 15 }}>{t('service.hours')}</b>
        <b style={{ fontSize: 20 }}>{settings.cs_hours || t('service.hours_default')}</b>
        <span style={{ color: 'var(--color-text)', whiteSpace: 'pre-line' }}>{settings.cs_hours_note || t('service.hours_note')}</span>
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
    </div>
  )
}
