import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCoupons } from '../lib/coupons'
import { useCart } from '../lib/cart'
import { money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { IconMenu, IconSearch } from '../components/Icons'
import { EmptyState, PageHeader, iconBtn } from '../components/ui'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

const pill = (on) => ({ flex: 'none', minHeight: 36, padding: '0 14px', borderRadius: 18, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })

// My coupons (artboard Member_Coupons): claim a code, usable / used / expired lists. Eligibility is always re-checked by the backend at checkout.
export default function Coupons() {
  const { t } = useTranslation()
  const cart = useCart()
  const { list, claim: claimCode } = useCoupons()
  const [tab, setTab] = useState('usable')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  useSeo({ title: t('coupons.title'), noindex: true })

  async function claim() {
    const c = code.trim().toUpperCase()
    if (!c) return
    try { const p = await claimCode(c); setCode(''); setMsg({ ok: true, text: t('coupons.claimed', { code: p.code }) }) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  const now = new Date()
  const isExpired = (c) => c.end_date && new Date(c.end_date).getTime() < now.getTime()
  const groups = { usable: list.filter((c) => !c.usedAt && !isExpired(c)), used: list.filter((c) => c.usedAt), expired: list.filter((c) => !c.usedAt && isExpired(c)) }
  const shown = groups[tab]
  const tagOf = (c) => (c.host ? t('coupons.tag_live', { host: c.host }) : /^WELCOME/i.test(c.code) ? t('coupons.tag_welcome') : /^BDAY/i.test(c.code) ? t('coupons.tag_birthday') : c.code)
  const ends = (c) => {
    if (!c.end_date) return ''
    const d = new Date(c.end_date)
    const left = Math.round((dayStart(d) - dayStart(now)) / 86400000)
    return left <= 3 ? t('coupons.ends_soon', { date: `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`, n: left }) : t('coupons.ends', { date: ymd(d) })
  }
  const right = (
    <>
      <Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link>
      <Link to="/menu" aria-label={t('menu.title')} style={iconBtn}><IconMenu /></Link>
    </>
  )
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('coupons.title')} to="/member" right={right} height={58} gap={8} />
      <div style={{ margin: '12px 16px 0', display: 'flex', gap: 8 }}>
        <label style={{ flex: 1, minHeight: 48, borderRadius: 24, border: '1.5px solid var(--color-border-strong)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('coupons.claim_ph')} aria-label={t('coupons.code_label')} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 15, background: 'transparent', fontFamily: 'inherit' }} />
        </label>
        <button type="button" onClick={claim} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', fontFamily: 'inherit' }}>{t('coupons.claim')}</button>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ margin: '8px 16px 0', fontSize: 13, color: msg.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{msg.text}</div>}
      <div style={{ padding: '14px 0 0' }}>
        <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 12px' }}>
          {['usable', 'used', 'expired'].map((k) => <button key={k} type="button" onClick={() => setTab(k)} style={pill(tab === k)}>{t(`coupons.${k}`, { n: groups[k].length })}</button>)}
        </div>
      </div>
      {shown.length === 0 && <EmptyState title={t('coupons.empty')} />}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((c) => {
          const lack = Math.max(0, c.min_order_amount - cart.subtotal)
          const short = tab === 'usable' && lack > 0
          const dead = tab !== 'usable'
          const head = c.type === 'percentage' ? t('coupons.pct', { pct: c.value }) : c.type === 'free_shipping' ? t('coupons.free') : money(c.value)
          const line = dead ? 'var(--color-border-strong)' : 'var(--color-secondary)'
          const scope = !c.min_order_amount ? t('coupons.all_products') : t('coupons.min_all', { amount: money(c.min_order_amount) })
          return (
            <div key={c.code} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', borderRadius: 16, background: dead ? 'var(--color-bg-soft)' : 'var(--color-coupon-bg)', border: `1.5px dashed ${line}`, overflow: 'hidden', opacity: dead ? 0.7 : 1 }}>
                <div style={{ flex: 'none', width: 92, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: `1.5px dashed ${line}` }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{t('coupons.off')}</span>
                  <b style={{ fontSize: 20, color: dead ? 'var(--color-disabled)' : 'var(--color-text)', textAlign: 'center' }}>{head}</b>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ alignSelf: 'flex-start', padding: '2px 6px', borderRadius: 4, background: dead ? 'var(--color-disabled)' : 'var(--color-text)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{tagOf(c)}</span>
                  <b style={{ fontSize: 15 }}>{c.title || c.code}</b>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{scope}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{tab === 'used' ? t('coupons.used_at', { date: c.usedAt > 1 ? ymd(new Date(c.usedAt)) : '' }) : ends(c)}</span>
                </div>
                <div style={{ flex: 'none', padding: '12px 12px 12px 0', display: 'flex', alignItems: 'center' }}>
                  {tab === 'usable' && <Link to="/cart" style={{ minHeight: 40, padding: '0 14px', borderRadius: 20, background: short ? 'var(--color-border)' : 'var(--color-primary)', color: short ? 'var(--color-text-2)' : 'var(--color-on-primary)', fontSize: short ? 12 : 13, fontWeight: 700, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>{short ? t('coupons.short', { amount: money(lack) }) : t('coupons.use')}</Link>}
                  {tab === 'used' && <span style={{ fontSize: 12, color: 'var(--color-disabled)', fontWeight: 700 }}>{t('coupons.used_on')}</span>}
                  {tab === 'expired' && <span style={{ fontSize: 12, color: 'var(--color-disabled)', fontWeight: 700 }}>{t('coupons.expired_tag')}</span>}
                </div>
              </div>
              {short && <span style={{ fontSize: 12, color: 'var(--color-text-2)', paddingLeft: 4 }}>{t('coupons.cart_now', { cart: money(cart.subtotal), amount: money(lack) })}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
