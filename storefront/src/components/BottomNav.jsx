import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../lib/cart'
import { IconCart, IconGrid, IconHeadset, IconHome } from './Icons'

const item = (active) => ({
  position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 26,
  textDecoration: 'none', fontSize: 11, ...(active ? { background: 'var(--color-primary-soft)', color: 'var(--color-primary-strong)', fontWeight: 700 } : { color: 'var(--color-text-2)' }),
})

// Floating glass capsule: Home / Kategori / CS / Keranjang (account & the rest live in the menu).
export default function BottomNav() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const { count } = useCart()
  return (
    <nav
      aria-label={t('nav.main')}
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 16, height: 68, zIndex: 30, padding: 6, boxSizing: 'border-box', borderRadius: 34,
        background: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--color-border)',
        boxShadow: '0 10px 28px rgba(30,30,35,0.16)', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', maxWidth: 528, margin: '0 auto',
      }}
    >
      <NavLink to="/" end style={({ isActive }) => item(isActive || /^\/(live|style)/.test(pathname))}><IconHome />{t('nav.home')}</NavLink>
      <NavLink to="/categories" style={({ isActive }) => item(isActive || /^\/(c\/|products)/.test(pathname))}><IconGrid />{t('nav.category')}</NavLink>
      <NavLink to="/service" style={({ isActive }) => item(isActive)}>
        <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(255,140,105,0.30)' }}>
          <IconHeadset size={19} />
        </span>
        {t('nav.cs')}
      </NavLink>
      <NavLink to="/cart" style={({ isActive }) => item(isActive)}>
        <IconCart />{t('nav.cart')}
        {count > 0 && (
          <span style={{ position: 'absolute', top: 4, left: '56%', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFFFFF' }}>{count}</span>
        )}
      </NavLink>
    </nav>
  )
}
