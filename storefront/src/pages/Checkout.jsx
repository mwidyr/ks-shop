import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createOrder, cvsSearch, img, onImgError, sized } from '../lib/api'
import { markUsed } from '../lib/claimed'
import { useCoupons } from '../lib/coupons'
import { useMember } from '../lib/member'
import { useCart } from '../lib/cart'
import { money } from '../lib/format'
import { saveLocalOrder } from '../lib/localOrders'
import { readProfile, rememberStore, writeProfile } from '../lib/profile'
import { isTwMobile, normPhone } from '../lib/phone'
import { useQuote } from '../lib/quote'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { safeHtml } from '../lib/safeHtml'
import { storeHelpText, waUrl } from '../lib/wa'
import { IconAlert, IconBack, IconCheck, IconChevDown, IconHeadset, IconSearch, IconSpinner, IconTruck } from '../components/Icons'
import { btnDark, btnOutline, btnPrimary, EmptyState, Field, iconBtn, inputStyle, Sheet } from '../components/ui'

const KEY = 'ralulu_checkout_v1'
const EMPTY = { step: 1, view: '', picked: false, name: '', phone: '', email: '', method: '', store: null, address: '', addrName: '', addrPhone: '', coupon: '' }

function ReceiptArt() {
  return (
    <svg width="100%" viewBox="0 0 300 220" style={{ maxWidth: 300, display: 'block', margin: '0 auto' }} role="img" aria-label="receipt">
      <path d="M40 10h220v200l-10-8-10 8-10-8-10 8-10-8-10 8-10-8-10 8-10-8-10 8-10-8-10 8-10-8-10 8-10-8z" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      <rect x="64" y="26" width="172" height="6" rx="3" fill="var(--color-border)" /><rect x="64" y="38" width="172" height="6" rx="3" fill="var(--color-border)" />
      <rect x="58" y="62" width="184" height="38" rx="8" fill="var(--color-error-bg)" stroke="var(--color-live)" strokeWidth="3" />
      <text x="70" y="86" fontSize="13" fontWeight="900" fill="var(--color-text)">店號 123456</text>
      <rect x="64" y="116" width="120" height="6" rx="3" fill="var(--color-border)" /><rect x="64" y="130" width="140" height="6" rx="3" fill="var(--color-border)" />
      <rect x="64" y="144" width="100" height="6" rx="3" fill="var(--color-border)" />
    </svg>
  )
}

function TutorialSheet({ open, onClose, chainName, csUrl }) {
  const { t, i18n } = useTranslation()
  const { settings } = useStore()
  // instructions + picture edited in Ralulu Hub (Store Profile); empty = the built-in tutorial
  const custom = settings.store_tutorial?.html?.[i18n.language] || ''
  const customImage = settings.store_tutorial?.image_url || ''
  const steps = [t('checkout.tut_1', { chain: chainName }), t('checkout.tut_2'), t('checkout.tut_3'), t('checkout.tut_4')]
  return (
    <Sheet open={open} onClose={onClose} title={t('checkout.tut_title')} footer={<button type="button" onClick={onClose} style={{ ...btnPrimary, width: '100%' }}>{t('checkout.tut_ok')}</button>}>
      {custom ? (
        <div data-testid="tutorial-custom" className="tutorial-rich" style={{ fontSize: 15, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: safeHtml(custom) }} />
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => (
            <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
              <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 13, background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>{s}
            </li>
          ))}
        </ol>
      )}
      <div style={{ margin: '14px 0 4px' }}><span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('checkout.example').toUpperCase()}</span></div>
      {customImage ? <img data-testid="tutorial-image" src={img(customImage)} alt={t('checkout.example')} loading="lazy" onError={onImgError} style={{ display: 'block', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 12 }} /> : <ReceiptArt />}
      {!customImage && <span style={{ display: 'block', textAlign: 'center', fontSize: 12, color: 'var(--color-text-2)', marginTop: 4 }}>{t('checkout.example_note')}</span>}
      <p style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
        {t('checkout.tut_no_receipt')} <a href={csUrl} target="_blank" rel="noreferrer">{t('checkout.tut_ask_cs')}</a>.
      </p>
    </Sheet>
  )
}


// ---- coupon sheet ----
function couponValue(c, subtotal, shipping) {
  if (subtotal < (c.min_order_amount || 0)) return -1
  if (c.type === 'percentage') return Math.round(subtotal * c.value / 100)
  if (c.type === 'free_shipping') return shipping
  return Math.min(c.value, subtotal)
}

function CouponSheet({ open, onClose, subtotal, shipping, current, onApply }) {
  const { t } = useTranslation()
  const { list, claim: claimCode, reload } = useCoupons()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { reload(); setErr(''); setCode('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function claim() {
    const c = code.trim().toUpperCase()
    if (!c) return
    setBusy(true); setErr('')
    try {
      await claimCode(c)
      setCode('')
    } catch (e) {
      setErr(e.message || t('checkout.c_bad'))
    } finally { setBusy(false) }
  }
  const rows = list.map((c) => ({ c, v: couponValue(c, subtotal, shipping) }))
  const best = rows.filter((r) => r.v > 0 && !r.c.usedAt).sort((a, b) => b.v - a.v)[0]
  const sel = current || ''
  const shown = rows.find((r) => r.c.code === sel)
  const after = Math.max(0, subtotal - (shown && shown.v > 0 && shown.c.type !== 'free_shipping' ? shown.v : 0) + (shown?.c.type === 'free_shipping' ? 0 : shipping))

  const ring = (on) => <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? 'var(--color-primary-strong)' : 'var(--color-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{on && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--color-primary)' }} />}</span>
  const rowCard = (on, dim) => ({ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, border: on ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: on ? 'var(--color-primary-soft)' : 'var(--color-surface)', textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit', cursor: dim ? 'default' : 'pointer', opacity: dim ? 0.6 : 1, width: '100%', boxSizing: 'border-box' })
  return (
    <Sheet open={open} onClose={onClose} title={t('checkout.c_title')} subtitle={t('checkout.c_auto')}
      footer={<>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '6px 2px' }}><span>{t('checkout.c_pay_after')}</span><b>{money(after)}</b></div>
        <button type="button" onClick={onClose} style={{ minHeight: 52, padding: '0 18px', borderRadius: 22, background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>{t('checkout.c_apply_btn')}</button>
      </>}>
      {rows.map(({ c, v }) => {
        const usable = v > 0 && !c.usedAt
        const on = sel === c.code
        const title = c.title || (c.type === 'percentage' ? t('checkout.c_pct', { pct: c.value }) : c.type === 'free_shipping' ? t('checkout.c_free') : t('checkout.c_off', { amount: money(c.value) }))
        const minus = c.type === 'percentage' ? '' : c.type === 'free_shipping' ? '' : ` −${money(c.value)}`
        return (
          <button key={c.code} type="button" disabled={!usable} onClick={() => onApply(on ? '' : c.code)} style={rowCard(on, !usable)}>
            {ring(on)}
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 15 }}>{title}{minus}{best && best.c.code === c.code && usable && rows.length > 1 ? '' : ''}</b>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{c.host ? `${t('coupons.tag_live', { host: c.host })}・` : ''}{c.min_order_amount > 0 ? t('checkout.c_min', { amount: money(c.min_order_amount) }) : c.code}</span>
              {!usable && v < 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-live)' }}>{t('checkout.c_short', { amount: money(c.min_order_amount - subtotal) })}</span>}
            </span>
          </button>
        )
      })}
      <button type="button" onClick={() => onApply('')} style={rowCard(!sel, false)}>
        {ring(!sel)}<span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{t('checkout.c_none')}</b></span>
      </button>
      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--color-primary-strong)', fontWeight: 700 }}>{t('checkout.c_have_code')}</summary>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('checkout.c_placeholder')} aria-label={t('checkout.c_enter')} style={{ ...inputStyle(Boolean(err)), flex: 1 }} />
          <button type="button" onClick={claim} disabled={busy || !code.trim()} style={{ ...btnDark, height: 48, padding: '0 16px' }}>{t('checkout.c_apply')}</button>
        </div>
        {err && <span role="alert" style={{ fontSize: 12, color: 'var(--color-error)', display: 'block', marginTop: 6 }}>{err}</span>}
      </details>
    </Sheet>
  )
}

function loadState() {
  let st
  try { st = { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') } } catch { st = { ...EMPTY } }
  // recipient details prefilled from this device's profile
  const pr = readProfile()
  if (!st.name && pr.name) st.name = pr.name
  if (!st.phone && pr.phone) st.phone = pr.phone
  if (!st.email && pr.email) st.email = pr.email
  return st
}
const defaultStore = (type) => {
  const x = readProfile().stores.filter((st) => st.chain === type)
  const d = x.find((st) => st.isDefault) || x[0]
  return d ? { code: d.code, name: d.name, addr: d.addr, verified: d.verified !== false } : null
}

const section = { margin: '12px 16px 0', padding: 16, borderRadius: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 12 }
const h2 = (size = 15) => ({ margin: 0, fontSize: size, fontWeight: 700 })
const linkSm = { fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)' }
const field = (err) => ({ flex: 1, minWidth: 0, minHeight: 50, borderRadius: 12, border: err ? '2px solid var(--color-live)' : '1px solid var(--color-border-strong)', background: 'var(--color-surface)', padding: '0 14px', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-text)' })
const chainLabel = (type) => (type === 'cvs_711' ? '7-ELEVEN' : type === 'cvs_familymart' ? 'FamilyMart' : '')

// Official logo placeholder (a dashed chip until the real logo files are dropped in).
function LogoBox({ type }) {
  return (
    <span role="img" aria-label={chainLabel(type)} style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'var(--color-surface)', border: '1.5px dashed var(--color-border-strong)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, boxSizing: 'border-box' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', letterSpacing: -0.2 }}>{chainLabel(type)}</span>
    </span>
  )
}

function Header({ title, onBack, csUrl }) {
  const { t } = useTranslation()
  return (
    <header style={{ height: 58, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
      <button type="button" aria-label={t('common.back')} onClick={onBack} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconBack /></button>
      <h1 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>{title}</h1>
      <a href={csUrl} target="_blank" rel="noreferrer" style={{ minHeight: 36, padding: '0 12px', borderRadius: 18, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}><IconHeadset size={16} />{t('co.cs')}</a>
    </header>
  )
}

function Steps({ current }) {
  const { t } = useTranslation()
  const labels = t('co.steps', { returnObjects: true })
  return (
    <div style={{ display: 'flex', padding: '12px 16px 4px' }}>
      {labels.map((l, i) => {
        const n = i + 1
        const done = n < current
        const on = n === current
        return (
          <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: n <= current ? 'var(--color-primary)' : 'var(--color-border)', color: n <= current ? 'var(--color-on-primary)' : 'var(--color-text-2)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? <IconCheck size={14} strokeWidth={3.4} /> : n}</span>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: on ? 'var(--color-text)' : 'var(--color-text-2)' }}>{l}</span>
          </div>
        )
      })}
    </div>
  )
}

function BottomBar({ total, hint, label, onClick, disabled, busy, minWidth = 150 }) {
  const { t } = useTranslation()
  const off = disabled && !busy
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 560, margin: '0 auto', padding: '12px 16px 20px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, zIndex: 30, boxSizing: 'border-box' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.total')}</span>
        <b style={{ fontSize: 20 }}>{money(total)}</b>
        {hint && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{hint}</span>}
      </div>
      <button type="button" disabled={disabled} aria-disabled={disabled} onClick={onClick}
        style={{ flex: 'none', minWidth: busy ? 170 : minWidth, minHeight: 52, padding: '0 18px', boxSizing: off ? 'content-box' : 'border-box', borderRadius: 26, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'not-allowed' : 'pointer', ...(off ? { background: 'var(--color-border)', color: 'var(--color-disabled)' } : { background: 'var(--color-primary)', color: 'var(--color-on-primary)', opacity: busy ? 0.85 : 1 }) }}>
        {busy && <IconSpinner />}{label}
      </button>
    </div>
  )
}

const iconBadge = (bg) => ({ width: 34, height: 34, borderRadius: 17, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flex: 'none' })
const pillBtn = (kind) => ({ minHeight: 44, padding: '0 18px', borderRadius: 22, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer',
  ...(kind === 'primary' ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none' } : kind === 'dark' ? { background: 'var(--color-text)', color: '#FFFFFF', border: 'none' } : { background: 'transparent', color: 'var(--color-text)', border: '1.5px solid var(--color-text)' }) })

// ---- store search screen (number or name) ----
function StoreScreen({ chain, onPick, csUrl, last, setLast }) {
  const { t } = useTranslation()
  const chainName = chainLabel(chain)
  const [q, setQ] = useState(last || '')
  const [status, setStatus] = useState('idle') // idle | loading | found | candidates | not_found | fail
  const [res, setRes] = useState(null)
  const [tutorial, setTutorial] = useState(false)
  const text = q.trim()
  const isCode = /^\d+$/.test(text)

  async function search(e) {
    e?.preventDefault()
    if (!text) return
    setLast?.(text)
    setStatus('loading')
    try {
      const r = await cvsSearch(chain, text)
      setRes(r)
      setStatus(r.status === 'unavailable' ? 'fail' : r.status)
    } catch { setStatus('fail') }
  }
  const pick = (s) => onPick({ code: s.code, name: s.name, addr: s.addr, verified: true })
  const border = status === 'found' || status === 'candidates' ? '2px solid var(--color-success)' : status === 'not_found' ? '2px solid var(--color-live)' : status === 'loading' ? '1.5px solid var(--color-border)' : '1.5px solid var(--color-border-strong)'
  const mono = isCode ? { fontSize: 26, fontWeight: 700, letterSpacing: 4, fontFamily: 'monospace' } : text && status !== 'idle' ? { fontSize: 17, fontWeight: 700 } : { fontSize: 15 }
  const resultCard = (extra) => ({ ...section, ...extra })
  const detect = status !== 'idle' && text ? (isCode ? t('co.detect_code') : t('co.detect_name')) : ''

  return (
    <>
      <section style={section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoBox type={chain} />
          <span style={{ display: 'flex', flexDirection: 'column' }}><h2 style={h2(17)}>{t('co.store_heading', { chain: chainName })}</h2><span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('co.store_sub')}</span></span>
        </div>
        <form onSubmit={search} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('co.store_label')}</span>
            <span style={{ position: 'relative', display: 'block' }}>
              <input type="search" value={q} disabled={status === 'loading'} placeholder={t('co.store_ph')} onChange={(e) => { setQ(e.target.value); if (status !== 'loading') setStatus('idle') }} autoComplete="off" inputMode={isCode ? 'numeric' : 'text'}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, borderRadius: 16, border, background: status === 'loading' ? 'var(--color-bg-soft)' : 'var(--color-surface)', padding: '0 18px', fontFamily: status === 'loading' || isCode ? 'monospace' : 'inherit', color: '#000000', ...mono, ...(status === 'loading' ? { fontSize: 26, fontWeight: 700, letterSpacing: 4 } : {}) }} />
            </span>
            {status === 'not_found'
              ? <span role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}><IconAlert size={16} />{t('co.store_hint_nf')}</span>
              : <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('co.store_hint')}</span>}
            {detect && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{detect}</span>}
          </label>
          <button type="submit" disabled={status === 'loading'} style={{ minHeight: 50, borderRadius: 25, border: 'none', background: 'var(--color-primary)', color: 'var(--color-on-primary)', opacity: status === 'loading' ? 0.85 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {status === 'loading' ? <><IconSpinner />{t('co.searching')}</> : <><IconSearch size={18} />{t('co.search')}</>}
          </button>
        </form>
      </section>

      {status === 'loading' && (
        <section style={section} role="status">
          <span className="skel" style={{ display: 'block', width: 36, height: 36, borderRadius: 18, background: 'var(--color-border)' }} />
          <span className="skel" style={{ display: 'block', width: '100%', height: 110, borderRadius: 14, background: 'var(--color-border)' }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-2)', textAlign: 'center' }}>{t('co.checking', { chain: chainName })}</span>
        </section>
      )}

      {status === 'found' && res?.results?.[0] && (() => {
        const st = res.results[0]
        return (
          <section style={resultCard({ border: '2px solid var(--color-success)' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={iconBadge('var(--color-success)')}><IconCheck size={18} /></span><b style={{ fontSize: 17, color: 'var(--color-success)' }}>{t('co.found')}</b></div>
            <div style={{ padding: 16, borderRadius: 14, background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LogoBox type={chain} />
                <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>店號</span><span style={{ fontSize: 32, fontWeight: 900, letterSpacing: 4, fontFamily: 'monospace', lineHeight: 1.1 }}>{st.code}</span></span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.store_name_l')}</span><b style={{ fontSize: 15 }}>{st.name}</b></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.store_addr_l')}</span><span style={{ fontSize: 15 }}>{st.addr}</span></div>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.found_note')}</span>
            </div>
            <button type="button" onClick={() => pick(st)} style={{ ...pillBtn('primary'), minHeight: 50, borderRadius: 25 }}>{t('co.use_store')}</button>
            <button type="button" onClick={() => { setStatus('idle'); setQ('') }} style={{ ...pillBtn('outline'), minHeight: 48, borderRadius: 24 }}>{t('co.not_this')}</button>
          </section>
        )
      })()}

      {status === 'candidates' && res && (
        <section style={resultCard({})}>
          <b style={{ fontSize: 15 }}>{t('co.candidates', { n: res.results.length, q: text })}</b>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('co.cand_hint')}</span>
          {res.results.map((s) => (
            <button key={s.code} type="button" onClick={() => pick(s)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{s.name}</b><span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{s.addr}</span><span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{t('co.store_no', { code: s.code })}</span></span>
              <span style={{ minHeight: 36, padding: '0 12px', borderRadius: 18, border: '1.5px solid var(--color-text)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{t('co.pick_this')}</span>
            </button>
          ))}
          {res.more && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.more_than')}</span>}
        </section>
      )}

      {status === 'not_found' && (
        <section style={resultCard({ border: '2px solid var(--color-live)' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={iconBadge('var(--color-live)')}><IconAlert size={18} /></span><b style={{ fontSize: 17, color: 'var(--color-live)' }}>{t('co.not_found')}</b></div>
          <span style={{ fontSize: 15 }}>{t('co.check_list')}</span>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.9 }}>
            <li>{t('co.check_1')}</li><li>{t('co.check_2')}</li><li>{t('co.check_3')}</li><li>{t('co.check_4')}</li>
          </ol>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px dashed var(--color-border-strong)' }}>
            <span style={{ fontSize: 13 }}>{t('co.nf_cs_note')}</span>
            <a href={csUrl} target="_blank" rel="noreferrer" style={{ ...pillBtn('dark'), minHeight: 48, borderRadius: 24 }}><IconHeadset size={16} />{t('co.nf_cs_btn')}</a>
          </div>
          <button type="button" onClick={() => { setStatus('idle'); setQ('') }} style={{ ...pillBtn('primary'), minHeight: 50, borderRadius: 25 }}>{t('co.retype')}</button>
        </section>
      )}

      {status === 'fail' && (
        <section style={resultCard({})}>
          <div role="alert" style={{ padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--color-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconAlert size={22} /></span>
            <b style={{ fontSize: 15 }}>{t('co.fail_title')}</b>
            <span style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{t('co.fail_text', { chain: chainName })}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={search} style={pillBtn('primary')}>{t('co.retry')}</button>
              <a href={csUrl} target="_blank" rel="noreferrer" style={pillBtn('dark')}><IconHeadset size={16} />{t('co.ask_cs')}</a>
            </div>
          </div>
        </section>
      )}

      <button type="button" onClick={() => setTutorial(true)} style={{ margin: '12px 16px 0', width: 'calc(100% - 32px)', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: 'var(--color-primary-soft)', border: '1.5px solid var(--color-secondary)', color: 'var(--color-text)', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>
        <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 20, background: 'var(--color-text)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900 }}>?</span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('co.tutorial_q')}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.tutorial_hint')}</span></span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('co.tutorial_cta')}</span>
      </button>
      <div style={{ margin: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" data-home onClick={() => onPick(null, 'home')} style={{ minHeight: 44, borderRadius: 22, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.to_home')}</button>
        <a href={csUrl} target="_blank" rel="noreferrer" style={{ minHeight: 44, borderRadius: 22, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{t('co.cs_find')}</a>
      </div>
      <TutorialSheet open={tutorial} onClose={() => setTutorial(false)} chainName={chainName} csUrl={csUrl} />
    </>
  )
}

export default function Checkout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { desktop } = useOutletContext()
  const cart = useCart()
  const { settings, chainId, chainFee, threshold, freeShip } = useStore()
  const [s, setS] = useState(loadState)
  const { me, signedIn } = useMember()
  const { list: coupons } = useCoupons()
  const [useBal, setUseBal] = useState(true)
  const [usePts, setUsePts] = useState(true)
  const [tried, setTried] = useState(false)
  const [submit, setSubmit] = useState('idle') // idle | sending | fail | conflict
  const [submitMsg, setSubmitMsg] = useState('')
  const [couponOpen, setCouponOpen] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const autoDone = useRef(false)
  // a signed-in member's name / phone / email fill the recipient form when it is still empty
  useEffect(() => {
    if (!me) return
    setS((cur) => ({ ...cur, name: cur.name || me.name || '', phone: cur.phone || (me.phone ? `0${String(me.phone).replace(/^886/, '')}` : ''), email: cur.email || me.email || '' }))
  }, [me])
  useSeo({ title: t('co.title'), noindex: true })

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }, [s])
  const set = (patch) => setS((cur) => ({ ...cur, ...patch }))

  const items = cart.selected
  const subtotal = cart.selectedSubtotal
  const cvs = s.method === 'cvs_711' || s.method === 'cvs_familymart'
  const courier = (settings.shipping_options || []).find((o) => o.chain_type === 'courier')
  const pickupChainId = s.method === 'courier' ? courier?.id || 0 : chainId(s.method)
  const { quote, error: quoteError } = useQuote({ items, pickupChainId, code: s.coupon, phone: normPhone(s.phone), useBalance: signedIn && useBal, usePoints: signedIn && usePts })

  // auto-pick the biggest coupon once
  useEffect(() => {
    if (autoDone.current || s.coupon) return
    const rows = coupons.filter((c) => !c.usedAt).map((c) => ({ c, v: couponValue(c, subtotal, quote?.shipping_fee || 0) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v)
    if (rows[0]) { autoDone.current = true; set({ coupon: rows[0].c.code }) } else if (coupons.length) autoDone.current = true
  }, [subtotal, quote, coupons]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (quote?.promotion_error && s.coupon) set({ coupon: '' }) }, [quote]) // eslint-disable-line react-hooks/exhaustive-deps

  const chainName = chainLabel(s.method)
  const csUrl = waUrl(settings.whatsapp_number, storeHelpText(i18n.language, chainName || 'CVS', lastQuery))
  const helpUrl = waUrl(settings.whatsapp_number, storeHelpText(i18n.language, 'checkout', ''))

  const phoneOk = isTwMobile(s.phone)
  const emailOk = !s.email.trim() || /^\S+@\S+\.\S+$/.test(s.email.trim())
  const nameOk = Boolean(s.name.trim())
  const step1Errors = [!nameOk && { id: 'c-name', label: t('co.err_name_li') }, !phoneOk && { id: 'c-phone', label: t('co.err_phone_li') }, !emailOk && { id: 'c-email', label: t('co.err_email_li') }].filter(Boolean)
  const addrOk = s.address.trim().length >= 6
  const f = freeShip(subtotal)
  const shipping = quote ? quote.shipping_fee : 0
  const total = quote ? (quote.payable_now ?? quote.total) : subtotal
  const logisticsDown = !(chainId('cvs_711') > 0 || chainId('cvs_familymart') > 0 || courier)
  const needStore = cvs && !s.store
  const step2Blocked = !s.method || needStore || (s.method === 'courier' && !addrOk)
  const step2Hint = logisticsDown ? t('co.logistics_hint') : !s.method ? t('co.choose_first') : ''

  function toStep(n) { set({ step: n, view: '', picked: false }); setTried(false); window.scrollTo(0, 0) }
  function next() {
    setTried(true)
    if (s.step === 1) { if (step1Errors.length) { document.getElementById(step1Errors[0].id)?.focus(); return } toStep(2); return }
    if (s.step === 2) { if (step2Blocked) return; toStep(3) }
  }
  function chooseMethod(type) {
    if (type === 'courier') { set({ method: 'courier', store: null }); return }
    const keep = s.method === type ? s.store : defaultStore(type)
    set({ method: type, store: keep, view: keep ? '' : 'store' })
  }
  function storePicked(st, how) {
    if (how === 'home') { set({ method: courier ? 'courier' : '', store: null, view: '' }); return }
    set({ store: st, view: '', picked: true })
  }

  async function place() {
    if (submit === 'sending') return
    setSubmit('sending'); setSubmitMsg('')
    try {
      const home = s.method === 'courier'
      const res = await createOrder({
        items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
        pickup_chain_id: pickupChainId,
        promotion_code: s.coupon,
        name: home ? (s.addrName.trim() || s.name.trim()) : s.name.trim(),
        phone: home ? normPhone(s.addrPhone.trim() || s.phone) : normPhone(s.phone),
        email: s.email.trim(),
        address: home ? s.address.trim() : '',
        pickup_store_code: cvs ? s.store.code : '',
        pickup_store_name: cvs ? s.store.name : '',
        store_unlisted: cvs ? !s.store.verified : false,
        source: 'self_checkout',
        use_balance: signedIn && useBal,
        use_points: signedIn && usePts,
      })
      saveLocalOrder({ orderNo: res.order_no, phone: normPhone(s.phone), total: res.total })
      // remember recipient + store on this device (guest profile)
      const pr = readProfile()
      writeProfile({ ...pr, name: pr.name || s.name.trim(), phone: pr.phone || s.phone.trim(), email: pr.email || s.email.trim() })
      if (cvs && s.store) rememberStore(s.method, s.store)
      if (s.coupon) markUsed(s.coupon)
      cart.removeSelected()
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      navigate('/checkout/success', { replace: true, state: { order: res, chain: chainName, store: cvs ? s.store : null, home, name: s.name, method: s.method } })
    } catch (e) {
      if (e.status === 409 || e.status === 400) { setSubmit('conflict'); setSubmitMsg(e.message) } else setSubmit('fail')
    }
  }

  const back = () => {
    if (s.view === 'store') { set({ view: '' }); return }
    if (s.step > 1) { toStep(s.step - 1); return }
    navigate('/cart')
  }

  if (items.length === 0 && submit !== 'sending') {
    return <div><Header title={t('co.title')} onBack={() => navigate('/cart')} csUrl={helpUrl} /><EmptyState title={t('checkout.empty')} text={t('checkout.empty_text')} action={<Link to="/cart" style={{ ...btnPrimary, marginTop: 8 }}>{t('checkout.to_cart')}</Link>} /></div>
  }

  // ---- screens ----
  const recipient = <span style={{ fontSize: 15 }}>{s.name}・{s.phone}</span>
  const delivery = (
    <section style={section}>
      <h2 style={h2(17)}>{t('co.choose_method')}</h2>
      {logisticsDown ? (
        <div role="alert" style={{ padding: '20px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1.5px solid var(--color-live)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--color-live)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconAlert size={22} /></span>
          <b style={{ fontSize: 15 }}>{t('co.logistics_fail_title')}</b>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{t('co.logistics_fail_text')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={() => window.location.reload()} style={pillBtn('primary')}>{t('co.reload')}</button>
            <a href={helpUrl} target="_blank" rel="noreferrer" style={pillBtn('dark')}><IconHeadset size={16} />{t('co.ask_cs')}</a>
          </div>
        </div>
      ) : (
        <>
          {[['cvs_711', 'co.at_711'], ['cvs_familymart', 'co.at_fm']].map(([type, key]) => {
            if (!(chainId(type) > 0)) return null
            const on = s.method === type
            return (
              <button key={type} type="button" role="radio" aria-checked={on} onClick={() => chooseMethod(type)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, border: on ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: on ? 'var(--color-primary-soft)' : 'var(--color-surface)', textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
                <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? 'var(--color-primary-strong)' : 'var(--color-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{on && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--color-primary)' }} />}</span>
                <LogoBox type={type} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontSize: 15 }}>{t(key)}</b>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.cvs_sub')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>{f.reached ? t('co.fee_free') : t('co.fee_line', { fee: money(chainFee(type)), min: money(threshold) })}</span>
                </span>
              </button>
            )
          })}
          {courier && (
            <button type="button" role="radio" aria-checked={s.method === 'courier'} onClick={() => chooseMethod('courier')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, border: s.method === 'courier' ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: s.method === 'courier' ? 'var(--color-primary-soft)' : 'var(--color-surface)', textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, border: `2px solid ${s.method === 'courier' ? 'var(--color-primary-strong)' : 'var(--color-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{s.method === 'courier' && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--color-primary)' }} />}</span>
              <span style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconTruck size={26} /></span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: 15 }}>{t('co.home_hct')}</b>
                <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.home_sub')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>{t('co.home_fee', { fee: money(courier.fee), days: '1–2' })}</span>
              </span>
            </button>
          )}
        </>
      )}
    </section>
  )

  const storeSection = cvs && (
    <section style={{ ...section, ...(tried && needStore ? { border: '2px solid var(--color-live)' } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 id="e-method" style={h2()}>{t('co.pickup_store')}</h2>
        {s.store && <button type="button" onClick={() => set({ view: 'store' })} style={{ ...linkSm, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.change_store')}</button>}
      </div>
      {s.store ? (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, background: s.store.verified ? 'var(--color-primary-soft)' : 'var(--color-warning-bg)', border: `2px solid ${s.store.verified ? 'var(--color-primary-strong)' : 'var(--color-warning)'}` }}>
            <LogoBox type={s.method} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{s.store.name || chainName}・店號 {s.store.code}</b>{s.store.addr && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{s.store.addr}</span>}</span>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: s.store.verified ? 'var(--color-success)' : 'var(--color-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>{s.store.verified ? <IconCheck size={14} /> : <IconAlert size={14} />}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: s.store.verified ? 'var(--color-success)' : 'var(--color-warning)' }}>{s.store.verified ? t('co.store_confirmed') : t('co.store_unverified')}</span>
        </>
      ) : (
        <>
          <button type="button" onClick={() => set({ view: 'store' })} style={{ boxSizing: 'content-box', minHeight: 58, borderRadius: 14, border: `2px dashed ${tried ? 'var(--color-live)' : 'var(--color-border-strong)'}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: tried ? 'var(--color-live)' : 'var(--color-text)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.choose_store', { chain: chainName })}</button>
          {tried && <span id="e-store" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}><IconAlert size={16} />{t('co.store_missing')}</span>}
        </>
      )}
    </section>
  )

  const homeForm = s.method === 'courier' && (
    <section style={section}>
      <h2 style={h2()}>{t('checkout.addr_title')}</h2>
      <Field label={t('checkout.addr_name')} htmlFor="a-name"><input id="a-name" value={s.addrName || s.name} onChange={(e) => set({ addrName: e.target.value })} style={inputStyle(false)} /></Field>
      <Field label={t('checkout.addr_phone')} htmlFor="a-phone"><input id="a-phone" value={s.addrPhone || s.phone} onChange={(e) => set({ addrPhone: e.target.value })} onBlur={() => { const n = normPhone(s.addrPhone || s.phone); if (n !== (s.addrPhone || s.phone)) set({ addrPhone: n }) }} inputMode="tel" style={inputStyle(false)} /></Field>
      <Field label={t('checkout.addr')} required hint={t('checkout.addr_hint')} error={tried && !addrOk ? t('checkout.addr_err') : ''} htmlFor="a-addr">
        <textarea id="a-addr" rows={3} value={s.address} onChange={(e) => set({ address: e.target.value })} style={{ ...inputStyle(tried && !addrOk), minHeight: 88, padding: 12 }} />
      </Field>
    </section>
  )

  let body
  let bar
  if (s.view === 'store' && cvs) {
    body = <StoreScreen chain={s.method} csUrl={csUrl} last={lastQuery} setLast={setLastQuery} onPick={storePicked} />
    bar = <BottomBar total={total} hint={t('co.search_first')} label={t('co.use_this_store')} disabled onClick={() => {}} />
  } else if (s.step === 1) {
    const errs = tried ? step1Errors : []
    body = (
      <>
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 14, background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('co.guest_title')}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.guest_text')}</span></span>
          <Link to="/login" style={linkSm}>{t('co.login')}</Link>
        </div>
        {errs.length > 0 && (
          <div role="alert" style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 14, background: 'var(--color-error-bg)', border: '1.5px solid var(--color-live)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}><IconAlert size={16} />{t('co.errors_n', { n: errs.length })}</b>
            {errs.map((e) => <a key={e.id} href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(e.id)?.focus() }} style={{ fontSize: 13, color: 'var(--color-error)' }}>・{e.label}</a>)}
          </div>
        )}
        <section style={section}>
          <h2 style={h2(17)}>{t('co.recipient')}</h2>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('co.name')} <span style={{ color: 'var(--color-live)' }}>*</span></span>
            <span style={{ display: 'flex', gap: 8 }}><input id="c-name" type="text" value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('co.name_ph')} autoComplete="name" aria-invalid={tried && !nameOk} aria-describedby={tried && !nameOk ? 'e-name' : undefined} style={field(tried && !nameOk)} /></span>
            {tried && !nameOk ? <span id="e-name" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}><IconAlert size={16} />{t('co.err_name')}</span> : <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.name_hint')}</span>}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('co.phone')} <span style={{ color: 'var(--color-live)' }}>*</span></span>
            <span style={{ display: 'flex', gap: 8 }}>
              <span style={{ flex: 'none', minHeight: 50, padding: '0 12px', borderRadius: 12, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', fontSize: 15 }}>+886 <IconChevDown size={12} /></span>
              <input id="c-phone" type="tel" value={s.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={() => { const n = normPhone(s.phone); if (n !== s.phone) set({ phone: n }) }} placeholder="0912 345 678" autoComplete="tel" aria-invalid={tried && !phoneOk} aria-describedby={tried && !phoneOk ? 'e-phone' : undefined} style={field(tried && !phoneOk)} />
            </span>
            {tried && !phoneOk ? <span id="e-phone" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}><IconAlert size={16} />{t('co.err_phone')}</span> : <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('co.phone_hint')}</span>}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('co.email')} <span style={{ fontWeight: 400, color: 'var(--color-text-2)' }}>{t('co.optional')}</span></span>
            <span style={{ display: 'flex', gap: 8 }}><input id="c-email" type="text" inputMode="email" value={s.email} onChange={(e) => set({ email: e.target.value })} onBlur={() => { const v = s.email.trim(); if (v !== s.email) set({ email: v }) }} placeholder="name@email.com" autoComplete="email" aria-invalid={tried && !emailOk} style={field(tried && !emailOk)} /></span>
            {tried && !emailOk && <span role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}><IconAlert size={16} />{t('co.err_email')}</span>}
          </label>
        </section>
      </>
    )
    bar = <BottomBar total={total} label={t('co.next_delivery')} onClick={next} />
  } else if (s.step === 2) {
    const errs2 = tried ? [!s.method && { id: 'e-method', label: t('co.err_method_li') }, needStore && { id: 'e-store', label: t('co.err_store_li') }, s.method === 'courier' && !addrOk && { id: 'a-addr', label: t('co.err_addr_li') }].filter(Boolean) : []
    body = (
      <>
        {errs2.length > 0 && (
          <div role="alert" style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 14, background: 'var(--color-error-bg)', border: '1.5px solid var(--color-live)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}><IconAlert size={16} />{t('co.errors_n', { n: errs2.length })}</b>
            {errs2.map((e) => <a key={e.id} href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(e.id)?.scrollIntoView({ block: 'center' }) }} style={{ fontSize: 13, color: 'var(--color-error)' }}>・{e.label}</a>)}
          </div>
        )}
        {s.picked && s.store && <div role="status" style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 12, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 13, fontWeight: 700 }}>{t('co.store_picked')}</div>}
        <section style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={h2()}>{t('co.recipient_sum')}</h2><button type="button" onClick={() => toStep(1)} style={{ ...linkSm, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.back_edit')}</button></div>
          {recipient}
        </section>
        {cvs && s.method ? (
          <section style={section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={h2()}>{t('co.delivery_sum')}</h2><button type="button" onClick={() => set({ method: '', store: null })} style={{ ...linkSm, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.back_edit')}</button></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><LogoBox type={s.method} /><b style={{ fontSize: 15 }}>{t('co.at_pay', { chain: chainName })}</b></div>
          </section>
        ) : delivery}
        {storeSection}
        {homeForm}
      </>
    )
    bar = <BottomBar total={total} hint={step2Hint} label={t('co.next_review')} onClick={next} disabled={logisticsDown || !s.method} />
  } else {
    const couponRow = s.coupon ? coupons.find((c) => c.code === s.coupon) : null
    body = (
      <>
        {(submit === 'fail' || submit === 'conflict') && (
          <div role="alert" style={{ margin: '12px 16px 0', padding: 14, borderRadius: 14, background: 'var(--color-error-bg)', border: '1.5px solid var(--color-live)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}><IconAlert size={18} />{t('co.submit_fail')}</b>
            {submit === 'conflict' ? <span style={{ fontSize: 13, lineHeight: 1.6 }}>{submitMsg}</span> : <span style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t('co.submit_fail_html') }} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {submit === 'fail' && <button type="button" onClick={place} style={pillBtn('primary')}>{t('co.resend')}</button>}
              <button type="button" onClick={() => toStep(2)} style={pillBtn('outline')}>{t('co.back_edit')}</button>
              <a href={helpUrl} target="_blank" rel="noreferrer" style={pillBtn('dark')}><IconHeadset size={16} />{t('co.ask_cs')}</a>
            </div>
          </div>
        )}
        <section style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={h2(17)}>{t('co.details')}</h2><Link to="/cart" style={linkSm}>{t('co.change_items')}</Link></div>
          {items.map((i) => (
            <div key={i.variantId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <img src={sized(img(i.image), 120)} alt={i.name} onError={onImgError} style={{ width: 52, height: 68, borderRadius: 8, objectFit: 'cover' }} />
              <span style={{ flex: 1, fontSize: 15, lineHeight: 1.5 }}>{i.name}<br /><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{[i.color, i.size].filter(Boolean).join(' / ')} × {i.qty}</span></span>
              <b>{money(i.price * i.qty)}</b>
            </div>
          ))}
        </section>
        <section style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={h2()}>{t('co.recipient_pickup')}</h2><button type="button" onClick={() => toStep(1)} style={{ ...linkSm, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{t('co.back_edit')}</button></div>
          <span style={{ fontSize: 15, lineHeight: 1.7 }}>
            {s.name}・{s.phone}<br />
            {cvs ? t('co.store_line', { chain: chainName, name: s.store?.name || '', code: s.store?.code }) : <>{t('co.home_hct')}・{s.address}</>}<br />
            {t('co.pay_store')}
            {cvs && !s.store?.verified && <><br /><span style={{ fontSize: 12, color: 'var(--color-warning)' }}>{t('co.store_unverified')}</span></>}
          </span>
        </section>
        <section style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span>{t('co.subtotal')}</span><span>{money(subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span>{t('co.shipping')}</span>{quote && shipping === 0 ? <b style={{ color: 'var(--color-success)' }}>{t('co.shipping_free')}</b> : <span>{quote ? money(shipping) : '—'}</span>}</div>
          {quote?.discount > 0 ? (
            <button type="button" onClick={() => setCouponOpen(true)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left' }}><span>{couponRow?.host ? t('co.coupon_live') : t('co.coupon')}</span><span style={{ color: 'var(--color-live)' }}>− {money(quote.discount)}</span></button>
          ) : (
            <button type="button" onClick={() => setCouponOpen(true)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', color: 'var(--color-text-2)', cursor: 'pointer' }}><span>{t('co.coupon')}</span><span style={linkSm}>{t('co.use_coupon')}</span></button>
          )}
          {quote?.wallet && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span>{t('wallet.applied')}</span><span style={{ color: 'var(--color-live)' }}>− {money(quote.wallet.balance + quote.wallet.points_value)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}><span>{t('co.total_pay')}</span><span>{money(total)}</span></div>
          {signedIn && (me.balance >= 1 || me.points > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              {me.balance >= 1 && <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={useBal} onChange={(e) => setUseBal(e.target.checked)} />{t('wallet.use_balance', { amount: money(me.balance) })}</label>}
              {me.points > 0 && <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={usePts} onChange={(e) => setUsePts(e.target.checked)} />{t('wallet.use_points', { n: me.points, amount: money(me.points * (me.point_value || 1)) })}</label>}
            </div>
          )}
        </section>
        {quote?.promotion_error && <span role="alert" style={{ display: 'block', margin: '8px 16px 0', fontSize: 12, color: 'var(--color-error)' }}>{quote.promotion_error}</span>}
        {quoteError && <span role="alert" style={{ display: 'block', margin: '8px 16px 0', fontSize: 12, color: 'var(--color-error)' }}>{quoteError}</span>}
        <p style={{ margin: '12px 16px 0', fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{t('co.agree')} <Link to="/info/terms">{t('co.terms')}</Link> {t('co.and')} <Link to="/info/returns">{t('co.return_policy')}</Link>。</p>
      </>
    )
    bar = <BottomBar total={total} label={submit === 'sending' ? t('co.sending') : t('co.continue_final')} onClick={place} busy={submit === 'sending'} disabled={submit === 'sending' || !quote} minWidth={150} />
  }

  const titleText = s.view === 'store' ? t('co.pick_store_title') : s.step === 3 ? t('co.review_title') : t('co.title')
  return (
    <div style={{ paddingBottom: 140 }}>
      <Header title={titleText} onBack={back} csUrl={helpUrl} />
      <div style={{ maxWidth: desktop ? 640 : 'none', margin: '0 auto' }}>
        <Steps current={s.step} />
        {body}
      </div>
      {bar}
      <CouponSheet open={couponOpen} onClose={() => setCouponOpen(false)} subtotal={subtotal} shipping={quote?.shipping_fee || 0} current={s.coupon} onApply={(c) => set({ coupon: c })} />
    </div>
  )
}
