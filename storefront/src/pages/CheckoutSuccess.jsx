import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { confirmText, lineUrl, waUrl } from '../lib/wa'
import { IconAlert, IconWhatsApp } from '../components/Icons'

const btn = (bg) => ({ minHeight: 56, borderRadius: 16, background: bg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' })

const LineMark = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3.5" width="20" height="14" rx="7" fill="#FFFFFF" /><path d="M8 17l-2 3.5 5.5-3.500z" fill="#FFFFFF" /><circle cx="8.5" cy="10.5" r="1.2" fill="#06C755" /><circle cx="12" cy="10.5" r="1.2" fill="#06C755" /><circle cx="15.5" cy="10.5" r="1.2" fill="#06C755" /></svg>
)

// Final step after the order is saved: the order stays pending until the customer messages CS on WhatsApp or LINE.
// Both buttons open the chat with "halo kak saya mau konfirmasi pesanan <order no>" already filled in.
export default function CheckoutSuccess() {
  const { t } = useTranslation()
  const { state } = useLocation()
  const { settings } = useStore()
  useSeo({ title: t('final.title'), noindex: true })
  if (!state?.order) return <Navigate to="/orders" replace />
  const orderNo = state.order.order_no
  const text = confirmText(orderNo)
  const wa = waUrl(settings.whatsapp_number, text)
  const line = lineUrl(settings.line_id, text)
  return (
    <div style={{ padding: '36px 20px 140px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
      <span style={{ color: 'var(--color-live)', display: 'flex' }}><IconAlert size={44} /></span>
      <h1 data-testid="final-title" style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.35 }}>{t('final.title')}</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{t('final.received')}</p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{t('final.text')}</p>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {wa && <a data-testid="final-wa" href={wa} target="_blank" rel="noreferrer" style={btn('#1FA855')}><IconWhatsApp size={24} />{t('final.wa')}</a>}
        {line && <a data-testid="final-line" href={line} target="_blank" rel="noreferrer" style={btn('#06C755')}><LineMark />{t('final.line')}</a>}
        {!wa && !line && <span role="status" style={{ fontSize: 13, color: 'var(--color-warning)' }}>{t('final.no_channel')}</span>}
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-text-2)', marginTop: 4 }}>{t('final.pending')}</span>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-2)' }}>
        {t('final.order_no')}: <b style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{orderNo}</b>
        {' · '}<Link to={`/orders/${orderNo}`}>{t('final.view')}</Link>
      </div>
    </div>
  )
}
