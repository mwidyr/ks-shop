import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { orderConfirmedText } from '../lib/wa'
import { csChannels } from '../lib/cs'
import { IconAlert } from '../components/Icons'

const btn = (bg) => ({ minHeight: 56, borderRadius: 16, background: bg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' })

// Final step after the order is saved: the order stays pending until the customer messages CS on WhatsApp or LINE.
// Separate buttons per chat app (not the sheet): each opens the chat with the "✅ ORDER CONFIRMED" message already filled in -
// order number, customer, store / address, the products with prices, subtotal, shipping and total.
export default function CheckoutSuccess() {
  const { t } = useTranslation()
  const { state } = useLocation()
  const { settings } = useStore()
  useSeo({ title: t('final.title'), noindex: true })
  if (!state?.order) return <Navigate to="/orders" replace />
  const orderNo = state.order.order_no
  const o = state.order
  const text = orderConfirmedText({
    orderNo, name: state.name, phone: state.phone,
    // 7-ELEVEN / FamilyMart: the store number; home delivery: the address
    storeLabel: state.home ? (state.address ? `Alamat: ${state.address}` : null) : state.store?.code ? `Alamat toko: ${state.store.code}` : null,
    items: state.items, subtotal: o.subtotal, shippingFee: o.shipping_fee, discount: o.discount, total: o.total,
  })
  const channels = csChannels(settings, text)
  return (
    <div style={{ padding: '36px 20px 140px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
      <span style={{ color: 'var(--color-live)', display: 'flex' }}><IconAlert size={44} /></span>
      <h1 data-testid="final-title" style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.35 }}>{t('final.title')}</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{t('final.received')}</p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{t('final.text')}</p>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {channels.map(({ key, color, Icon, label, url }) => (
          <a key={key} data-testid={`final-${key === 'whatsapp' ? 'wa' : key}`} href={url} target="_blank" rel="noreferrer" style={btn(color)}><Icon size={24} stroke="#FFFFFF" />{t(key === 'whatsapp' ? 'final.wa' : key === 'line' ? 'final.line' : 'cs.open_in', { app: label })}</a>
        ))}
        {channels.length === 0 && <span role="status" style={{ fontSize: 13, color: 'var(--color-warning)' }}>{t('final.no_channel')}</span>}
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-text-2)', marginTop: 4 }}>{t('final.pending')}</span>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-2)' }}>
        {t('final.order_no')}: <b style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{orderNo}</b>
        {' · '}<Link to={`/orders/${orderNo}`}>{t('final.view')}</Link>
      </div>
    </div>
  )
}
