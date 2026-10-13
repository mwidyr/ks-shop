import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../lib/store'
import { useMember } from '../lib/member'
import { useSeo } from '../lib/seo'
import { topicText, waUrl } from '../lib/wa'

const ICON_USER = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
const ICONS = {
  fav: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2B2B2E" strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>,
  account: ICON_USER,
  coupons: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /><path d="M10 8v10" /></svg>,
  orders: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>,
  style: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" /><path d="M20 5h-4a2 2 0 0 0-2 2" /></svg>,
  live: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M10 9.5l5 2.5-5 2.5z" /></svg>,
  about: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>,
}

// Side drawer under the language bar (artboard Menu): dimmed page, 320px panel, account card, feature list, CS WhatsApp.
export default function Menu() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useStore()
  const { me, signedIn } = useMember()
  useSeo({ title: t('menu.title'), noindex: true })
  const rows = [
    ['/wishlist', 'fav', t('menu.fav'), 'fav_sub'],
    [signedIn ? '/member' : '/login', 'account', t('menu.account'), 'account_sub'],
    ['/coupons', 'coupons', t('menu.coupons'), 'coupons_sub'],
    ['/orders', 'orders', t('menu.orders'), 'orders_sub'],
    ['/style', 'style', t('menu.style'), 'style_sub'],
    ['/live', 'live', t('menu.live'), 'live_sub'],
    ['/info/about', 'about', t('menu.about'), 'about_sub'],
  ]
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  const hideSub = i18n.language === 'en'
  return (
    <div style={{ position: 'fixed', top: 46, left: 0, right: 0, bottom: 0, zIndex: 150 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.45)' }} />
      <aside role="dialog" aria-modal="true" aria-label={t('menu.title')} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, maxWidth: '100%', background: 'var(--color-bg)', padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '-12px 0 30px rgba(30,30,35,0.25)', boxSizing: 'content-box', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <span className="serif" style={{ fontSize: 26, fontStyle: 'italic', fontWeight: 700, color: 'var(--color-primary-strong)' }}>ralulu</span>
          <button type="button" onClick={close} aria-label={t('menu.close')} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', background: 'none', border: 'none', padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <Link to={signedIn ? '/member' : '/login'} style={{ padding: 14, borderRadius: 16, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--color-text)' }}>
          <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ICON_USER}</span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {signedIn
              ? <><b style={{ fontSize: 15 }}>{me.name || me.phone || me.email}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('mc.balance')} NT${Math.round(me.balance).toLocaleString('en-US')}・{t('mc.points')} {me.points}</span></>
              : <><b style={{ fontSize: 15 }}>{t('mc.login')}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('menu.guest_text')}</span></>}
          </span>›
        </Link>
        <nav aria-label={t('menu.nav_label')}>
          {rows.map(([to, k, label, sub]) => (
            <Link key={k} to={to} style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '0 4px', borderBottom: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
              <span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ICONS[k]}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <b style={{ fontSize: 15 }}>{label}</b>
                {!hideSub && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t(`menu.${sub}`)}</span>}
              </span>
              <span style={{ color: 'var(--color-disabled)' }}>›</span>
            </Link>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <a href={waUrl(settings.whatsapp_number, topicText(i18n.language, 'other'))} target="_blank" rel="noreferrer" style={{ minHeight: 52, borderRadius: 26, background: '#1FA855', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c.3 2 1.8 3.8 4.3 4.6l1.2-1.1 1.8.8-.4 1.6c-3.6.2-7-3-7.2-6.6l1.6-.5.8 1.8z" /></svg>{t('menu.cs')}
        </a>
        <span style={{ fontSize: 12, color: 'var(--color-text-2)', textAlign: 'center' }}>{t('menu.note')}</span>
      </aside>
    </div>
  )
}
