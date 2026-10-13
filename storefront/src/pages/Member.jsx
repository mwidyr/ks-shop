import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHosts, getMemberOrders } from '../lib/api'
import { useFavorites } from '../lib/favorites'
import { listClaimed } from '../lib/claimed'
import { listLocalOrders } from '../lib/localOrders'
import { money, orderTab } from '../lib/format'
import { useMember } from '../lib/member'
import { useProfile } from '../lib/profile'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { whenLabel } from '../lib/when'
import { IconFacebook, IconInstagram, IconTiktok, IconYoutube } from '../components/Icons'

const svg = (d, size = 20) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const ORDER_TILES = [
  ['pending', 'mem.pay', 'M3 7h18v11H3zM3 11h18'],
  ['processing', 'mem.wait_ship', 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8'],
  ['shipping', 'mem.shipping', 'M3 7h11v9H3zM14 10h4l3 3v3h-7'],
  ['return', 'mem.ret', 'M4 9h12a4 4 0 0 1 0 8H8M4 9l4-4M4 9l4 4'],
]
const TOOLS = [
  ['mem.t_fav', 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', '/wishlist'],
  ['mem.t_recent', 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2', '/wishlist'],
  ['mem.t_coupons', 'M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM10 8v10', '/coupons'],
  ['mem.t_balance', 'M4 7h16v12H4zM4 11h16M15 15h2', '/wallet'],
  ['mem.t_addr', 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 8v4', '/profile'],
  ['mem.t_size', 'M3 9h18v6H3zM7 9v3M11 9v3M15 9v3', '/profile'],
  ['mem.t_invite', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c1-3 3.5-5 6-5s5 2 6 5M18 8v6M15 11h6', '/member#invite'],
  ['mem.t_cs', 'M4 13a8 8 0 0 1 16 0M4 13v3a2 2 0 0 0 2 2h2v-5H4M20 13v3a2 2 0 0 1-2 2h-2v-5h4', '/service'],
]
const card = { margin: '14px 16px 0', borderRadius: 16, background: '#fff', border: '1px solid var(--color-border)' }

// Member center (artboard Member): dark header, balance / coupons / points, order shortcuts, tools, referral, live socials, settings list.
// Guests see the same page filled from this device with a login prompt.
export default function Member() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { state } = useLocation()
  const { me, signedIn, logout } = useMember()
  const { profile } = useProfile()
  const { count: favCount } = useFavorites()
  const { settings } = useStore()
  const [copied, setCopied] = useState(false)
  const [tabs, setTabs] = useState({})
  const [nextLive, setNextLive] = useState('')
  useSeo({ title: t('member.title'), noindex: true })
  useEffect(() => {
    if (!signedIn) { setTabs({}); return undefined }
    let alive = true
    getMemberOrders().then((list) => { if (alive) setTabs(list.reduce((m, o) => { const k = orderTab(o.status); m[k] = (m[k] || 0) + 1; return m }, {})) }).catch(() => {})
    return () => { alive = false }
  }, [signedIn])
  useEffect(() => {
    getHosts().then((d) => {
      const soon = (d.hosts || []).filter((h) => h.next_live_at).sort((a, b) => new Date(a.next_live_at) - new Date(b.next_live_at))[0]
      setNextLive(soon ? whenLabel(soon.next_live_at, t, i18n.language) : '')
    }).catch(() => {})
  }, [i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps
  const social = settings.social || {}
  const links = [[IconYoutube, 'YouTube', social.youtube], [IconInstagram, 'Instagram', social.instagram], [IconFacebook, 'Facebook', social.facebook], [IconTiktok, 'TikTok', social.tiktok]]
  const name = signedIn ? (me.name || me.phone || me.email) : (profile.name || t('member.guest'))
  const counts = signedIn ? me.counts : { orders: listLocalOrders().length, coupons: listClaimed().filter((c) => !c.usedAt && !(c.end_date && new Date(c.end_date) < new Date())).length, favorites: favCount }
  const reward = settings.rewards?.referral_reward ?? 50
  const shareText = me ? t('referral.share_text', { code: me.referral_code }) : ''
  const shareUrl = me ? `${window.location.origin}/login?ref=${me.referral_code}` : ''
  async function share() {
    if (navigator.share) { try { await navigator.share({ text: shareText, url: shareUrl }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(`${shareText} ${shareUrl}`); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }
  const tiles = signedIn
    ? [[money(me.balance), t('mc.balance'), '/wallet'], [counts.coupons, t('mc.coupons'), '/coupons'], [me.points, t('mc.points'), '/wallet']]
    : [[counts.orders, t('member.shop_orders'), '/orders'], [counts.coupons, t('member.coupons'), '/coupons'], [counts.favorites, t('member.favorites'), '/wishlist']]
  const langName = { id: 'Indonesia', en: 'English', zh: '中文' }[i18n.language] || 'Indonesia'
  const rows = [
    ['/language', t('mem.s_lang', { name: langName })], ['/profile', t('mem.s_profile')], ['/profile', t('mem.s_notif')], ['/profile', t('mem.s_pay')], ['/info/terms', t('mem.s_privacy')],
  ]
  const chev = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
  return (
    <div style={{ paddingBottom: 130 }}>
      {state?.welcome && <div role="status" style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 14, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 700, fontSize: 14 }}>🎉 {t('login.welcome_done')}</div>}
      <header style={{ padding: '22px 16px 54px', background: 'var(--color-text)', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 60, height: 60, borderRadius: 30, background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 10, background: 'var(--color-primary)', fontSize: 11, fontWeight: 700, color: 'var(--color-on-primary)' }}>{signedIn ? t('mc.member_regular') : t('member.guest_sub')}</span>
        </span>
        <Link to={signedIn ? '/profile' : '/login'} style={{ color: '#FFFFFF', fontSize: 13, textDecoration: 'none' }}>{signedIn ? t('member.edit') : `${t('mc.login')} ›`}</Link>
      </header>
      <section style={{ margin: '-36px 16px 0', borderRadius: 16, background: '#fff', border: '1px solid var(--color-border)', boxShadow: '0 2px 8px rgba(43,34,38,0.06)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: '14px 0', position: 'relative' }}>
        {tiles.map(([n, l, to], i) => (
          <Link key={l} to={to} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', color: 'var(--color-text)', borderLeft: i === 1 ? '1px solid var(--color-border)' : 'none', borderRight: i === 1 ? '1px solid var(--color-border)' : 'none' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{n}</span><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{l}</span>
          </Link>
        ))}
      </section>
      <section style={{ ...card, padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('member.orders')}</h2>
          <Link to="/orders" style={{ fontSize: 13, color: 'var(--color-text-2)', textDecoration: 'none' }}>{t('member.all_orders')}</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {ORDER_TILES.map(([k, label, d]) => (
            <Link key={k} to={`/orders?tab=${k}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--color-text)', position: 'relative' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-primary-soft)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{svg(d, 22)}</span>
              <span style={{ fontSize: 12 }}>{t(label)}</span>
              {tabs[k] > 0 && <span style={{ position: 'absolute', top: -4, right: 14, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tabs[k]}</span>}
            </Link>
          ))}
        </div>
      </section>
      <section style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px 4px' }}>
        {TOOLS.map(([label, d, to]) => (
          <Link key={label} to={to} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--color-text)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{svg(d)}</span>
            <span style={{ fontSize: 12 }}>{t(label)}</span>
          </Link>
        ))}
      </section>
      {signedIn && (
        <section id="invite" style={{ margin: '14px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-coupon-bg)', border: '1px solid var(--color-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('referral.title', { amount: money(reward) })}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('referral.text')}</span>
          </span>
          <button type="button" onClick={share} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, border: 'none' }}>{copied ? t('referral.copied') : t('referral.share')}</button>
        </section>
      )}
      <section style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('member.live_title')}</h2>
          {nextLive && <span style={{ fontSize: 12, color: 'var(--color-live)', fontWeight: 700 }}>{t('mem.live_next', { when: nextLive })}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {links.map(([Icon, label, url]) => (
            <a key={label} href={url || '#'} target={url ? '_blank' : undefined} rel="noreferrer" aria-label={label} style={{ flex: 1, height: 44, borderRadius: 12, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}><Icon size={20} />{label}</a>
          ))}
        </div>
      </section>
      <section style={{ ...card, overflow: 'hidden' }}>
        {rows.map(([to, label]) => (
          <Link key={label} to={to} style={{ height: 50, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', color: 'var(--color-text)', fontSize: 15, borderBottom: '1px solid var(--color-border)' }}>{label}{chev}</Link>
        ))}
        {signedIn && <button type="button" onClick={() => { if (window.confirm(t('mc.logout_confirm'))) { logout(); navigate('/') } }} style={{ width: '100%', height: 50, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', color: 'var(--color-text)', fontSize: 15, textAlign: 'left' }}>{t('mem.s_logout')}{chev}</button>}
      </section>
    </div>
  )
}
