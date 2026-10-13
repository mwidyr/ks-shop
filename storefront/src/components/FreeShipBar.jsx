import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../lib/cart'
import { useStore } from '../lib/store'
import { money } from '../lib/format'

// Floating free-shipping progress on Home. One rule (store settings) drives every free-shipping
// message; the backend still recomputes the real fee at checkout.
export default function FreeShipBar({ bottom = 92 }) {
  const { t } = useTranslation()
  const { subtotal, count } = useCart()
  const { freeShip } = useStore()
  const f = freeShip(subtotal)
  if (!f.active || count === 0) return null
  return (
    <Link
      to="/cart"
      style={{ position: 'fixed', left: 16, right: 16, bottom, minHeight: 48, borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 4px 14px rgba(30,30,35,0.10)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', textDecoration: 'none', zIndex: 25, maxWidth: 528, margin: '0 auto', boxSizing: 'border-box' }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <b style={{ fontSize: 13 }}>{f.reached ? t('freebar.reached') : t('freebar.remaining', { amount: money(f.remaining) })}</b>
        <span style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-soft)', marginTop: 4, display: 'block' }}>
          <span style={{ display: 'block', width: `${f.pct}%`, height: '100%', borderRadius: 2, background: 'var(--color-primary)' }} />
        </span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('freebar.to_cart')}</span>
    </Link>
  )
}
