import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { money } from '../lib/format'
import { useMember } from '../lib/member'
import { useSeo } from '../lib/seo'
import { IconCheck, IconWhatsApp } from '../components/Icons'
import { btnWhatsApp } from '../components/ui'

const pill = (kind) => ({ minHeight: 44, padding: '0 18px', borderRadius: 22, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box',
  ...(kind === 'primary' ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' } : kind === 'dark' ? { background: 'var(--color-text)', color: '#FFFFFF' } : { border: '1.5px solid var(--color-text)', color: 'var(--color-text)' }) })

// After the order is saved (artboard ZH_Success) + the hand-off to WhatsApp (admin-configured number, order details prefilled).
export default function CheckoutSuccess() {
  const { t } = useTranslation()
  const { state } = useLocation()
  const { signedIn } = useMember()
  useSeo({ title: t('success.title'), noindex: true })
  if (!state?.order) return <Navigate to="/orders" replace />
  const { order, chain, store, home } = state
  const wa = order.whatsapp || {}
  const pickup = home ? t('success.home_delivery') : `${chain} ${store?.name || ''}`.trim()
  const row = (label, value, big) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span style={{ color: 'var(--color-text-2)' }}>{label}</span><b style={big ? { fontSize: 17 } : undefined}>{value}</b></div>
  )
  return (
    <div style={{ paddingBottom: 120 }}>
      <section style={{ padding: '40px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <span style={{ width: 76, height: 76, borderRadius: 38, background: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconCheck size={40} strokeWidth={3} /></span>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{t('success.title')}</h1>
        <span style={{ fontSize: 15, color: 'var(--color-text-2)', lineHeight: 1.7 }}>{t('success.order_no')} <b style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{order.order_no}</b><br />{t('success.notified')}</span>
      </section>
      <section style={{ margin: '12px 16px 0', padding: 16, borderRadius: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {row(t('success.pickup'), pickup)}
        {row(t('success.method'), t('success.pay_store'))}
        {row(t('success.total'), money(order.total), true)}
      </section>
      {order.store_verified === false && <span role="status" style={{ display: 'block', margin: '10px 16px 0', fontSize: 13, color: 'var(--color-warning)' }}>{t('success.unverified')}</span>}
      <div style={{ margin: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Link to={`/orders/${order.order_no}`} style={pill('outline')}>{t('success.view')}</Link>
        <Link to="/" style={pill('primary')}>{t('success.keep')}</Link>
      </div>
      {!signedIn && (
        <div style={{ margin: '16px 16px 0', padding: 14, borderRadius: 16, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('success2.acct_title')}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('success2.acct_text')}</span></span>
          <Link to="/login" style={pill('dark')}>{t('success2.acct_btn')}</Link>
        </div>
      )}
      <section style={{ margin: '16px 16px 0', padding: 16, borderRadius: 18, background: 'var(--color-success-bg)', border: '1.5px solid var(--color-success)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>{t('success.wa_title')}</b>
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{wa.url ? t('success.wa_text') : t('success.wa_missing')}</span>
        {wa.url && <a href={wa.url} target="_blank" rel="noreferrer" style={{ ...btnWhatsApp, height: 52 }}><IconWhatsApp size={20} />{t('success.wa_btn')}</a>}
      </section>
    </div>
  )
}
