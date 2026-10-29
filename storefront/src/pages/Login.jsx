import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { memberEmailRequest, memberEmailVerify, memberWaStart, memberWaStatus, sized, img, onImgError } from '../lib/api'
import { money } from '../lib/format'
import { useMember } from '../lib/member'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { IconClose, IconChevDown, IconSpinner, IconWhatsApp } from '../components/Icons'
import { useDesktop } from '../hooks/useMedia'

const field = { flex: 1, minWidth: 0, height: 48, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '0 14px', fontSize: 15, color: 'var(--color-text)', boxSizing: 'border-box' }
const bigBtn = (bg, color = '#FFFFFF') => ({ height: 48, borderRadius: 24, border: 'none', background: bg, color, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' })
const PHONE_RE = /^(09\d{8}|9\d{8})$/
// where to go after logging in: an internal path only (e.g. /checkout), never another site
const safeNext = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '')
const clean = (s) => s.replace(/[\s-]/g, '').replace(/^\+886/, '0')

// Login / Sign up (one flow: the first verified login creates the account). Layout follows Login.dc.html;
// WhatsApp = the member sends the code from their own WhatsApp, Email = a mailed code (with resend + cooldown).
export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const { login, signedIn } = useMember()
  const { settings } = useStore()
  const desktop = useDesktop()
  useSeo({ title: t('login.tab_login'), noindex: true })
  const ref = sp.get('ref') || (() => { try { return sessionStorage.getItem('ralulu_ref') || '' } catch { return '' } })()
  useEffect(() => { if (sp.get('ref')) { try { sessionStorage.setItem('ralulu_ref', sp.get('ref')) } catch { /* ignore */ } } }, [sp])

  const [tab, setTab] = useState('login')
  const next = safeNext(sp.get('next'))
  const [method, setMethod] = useState('email') // email (default: an email account is needed to order) | phone (WhatsApp)
  const waOff = settings.whatsapp_login === false
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [cool, setCool] = useState(0)
  const [wa, setWa] = useState(null) // { id, code, url, phone, state: 'waiting' | 'expired' | 'off' }
  const [copied, setCopied] = useState(false)
  const poll = useRef(null)

  useEffect(() => { if (signedIn) navigate(next || '/member', { replace: true }) }, [signedIn, navigate, next])
  useEffect(() => { if (waOff) setMethod('email') }, [waOff])
  useEffect(() => { if (cool <= 0) return undefined; const id = setTimeout(() => setCool((c) => c - 1), 1000); return () => clearTimeout(id) }, [cool])
  useEffect(() => () => clearInterval(poll.current), [])

  const finish = useCallback(async (res) => {
    clearInterval(poll.current)
    await login(res.token, res.member, res.created)
    navigate(next || '/member', { replace: true, state: { welcome: res.created } })
  }, [login, navigate, next])

  async function startWa() {
    if (!PHONE_RE.test(clean(phone))) { setErr(t('login.phone_err')); return }
    setErr(''); setBusy(true)
    try {
      const r = await memberWaStart(phone, '886', ref)
      if (!r.configured) { setWa({ state: 'off' }); return }
      setWa({ id: r.challenge_id, code: r.code, url: r.wa_url, phone, state: 'waiting' })
      clearInterval(poll.current)
      const started = Date.now()
      poll.current = setInterval(async () => {
        try {
          const st = await memberWaStatus(r.challenge_id, phone, '886')
          if (st.token) finish(st)
          else if (st.status === 'expired' || Date.now() - started > r.expires_in * 1000) { clearInterval(poll.current); setWa((w) => (w ? { ...w, state: 'expired' } : w)) }
        } catch { /* keep polling */ }
      }, 2500)
    } catch (e) { setErr(e.message || t('common.error_generic')) } finally { setBusy(false) }
  }

  async function sendEmail() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t('login.email_err')); return }
    setErr(''); setBusy(true)
    try { const r = await memberEmailRequest(email.trim(), ref); setSentTo(email.trim()); setCool(r.cooldown || 30) } catch (e) { setErr(e.message || t('common.error_generic')) } finally { setBusy(false) }
  }
  async function verifyEmail() {
    if (!/^\d{6}$/.test(code.trim())) { setErr(t('login.code_err')); return }
    setErr(''); setBusy(true)
    try { finish(await memberEmailVerify(email.trim(), code.trim())) } catch (e) { setErr(e.status === 401 ? t('login.wrong_code') : e.message) } finally { setBusy(false) }
  }

  const welcomeAmount = money(settings.rewards?.welcome_balance ?? 100)
  const welcomeMin = money(settings.free_shipping_minimarket || 1500)
  const waBtn = bigBtn('#1FA855')
  const mailBtn = bigBtn('var(--color-text)', 'var(--color-bg)')

  return (
    <div style={{ maxWidth: desktop ? 440 : 'none', margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ position: 'relative', height: 280, overflow: 'hidden', background: 'linear-gradient(135deg, var(--color-primary-soft), var(--color-secondary))' }}>
        {settings.splash_url ? <img src={img(settings.splash_url)} alt="" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} /> : null}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.35)' }} />
        <Link to="/" aria-label={t('login.close')} style={{ position: 'absolute', top: 10, left: 8, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></Link>
        <div style={{ position: 'absolute', left: 20, bottom: 22, color: '#FFFFFF' }}>
          <div className="serif" style={{ fontSize: 32, fontStyle: 'italic', fontWeight: 700 }}>ralulu</div>
          <div style={{ fontSize: 15 }}>{t('login.tagline')}</div>
        </div>
      </div>

      <section style={{ margin: '-16px 0 0', position: 'relative', borderRadius: '22px 22px 0 0', background: 'var(--color-bg)', padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', padding: 4, borderRadius: 24, background: 'var(--color-bg-soft)' }}>
          {['login', 'register'].map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ height: 40, borderRadius: 20, border: 'none', fontSize: 15, background: tab === k ? 'var(--color-surface)' : 'transparent', fontWeight: tab === k ? 700 : 400, color: tab === k ? 'var(--color-text)' : 'var(--color-text-2)', boxShadow: tab === k ? '0 1px 4px rgba(30,30,35,0.08)' : 'none' }}>
              {t(`login.tab_${k}`)}
            </button>
          ))}
        </div>
        {next === '/checkout' && <div role="note" style={{ padding: '12px 14px', borderRadius: 14, border: '1.5px solid var(--color-primary)', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{t('gate.login_note')}</div>}
        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--color-primary-soft)', fontSize: 13, color: 'var(--color-text)' }} dangerouslySetInnerHTML={{ __html: t('login.welcome', { amount: welcomeAmount, min: welcomeMin }) }} />

        {wa ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 16, border: '1.5px solid #1FA855', background: 'var(--color-success-bg)' }}>
            <b style={{ fontSize: 16 }}>{t('login.wa_title')}</b>
            {wa.state === 'off' ? <span role="alert" style={{ fontSize: 14 }}>{t('login.wa_off')}</span> : (
              <>
                <span style={{ fontSize: 13, lineHeight: 1.6 }}>{t('login.wa_steps')}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('login.wa_same', { phone: wa.phone })}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'var(--color-surface)', border: '1px dashed var(--color-border-strong)' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('login.wa_code')}</span>
                  <b style={{ fontSize: 24, letterSpacing: 4 }}>{wa.code}</b>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(wa.code); setCopied(true); setTimeout(() => setCopied(false), 1500) }} style={{ border: 'none', background: 'none', color: 'var(--color-primary-strong)', fontWeight: 700, fontSize: 12 }}>{copied ? t('login.wa_copied') : t('login.wa_copy')}</button>
                </div>
                {wa.state === 'waiting' ? (
                  <>
                    <a href={wa.url} target="_blank" rel="noreferrer" style={waBtn}><IconWhatsApp size={18} stroke="#FFFFFF" />{t('login.wa_open')}</a>
                    <span role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-2)' }}><IconSpinner size={16} />{t('login.wa_waiting')}</span>
                  </>
                ) : <span role="alert" style={{ color: 'var(--color-error)', fontSize: 13 }}>{t('login.wa_expired')}</span>}
              </>
            )}
            <button type="button" onClick={() => { clearInterval(poll.current); if (wa.state === 'expired') startWa(); else setWa(null) }} style={{ ...bigBtn('transparent', 'var(--color-text)'), border: '1.5px solid var(--color-text)', height: 44 }}>{wa.state === 'expired' ? t('login.wa_again') : t('login.wa_cancel')}</button>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => { setMethod('email'); setErr('') }} style={mailBtn}>{t('login.email_btn')}</button>
            {settings.whatsapp_login !== false && <button type="button" onClick={() => { setMethod('phone'); startWa() }} disabled={busy} style={waBtn}>{t('login.wa')}</button>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-disabled)' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />{method === 'email' ? t('login.or_email') : t('login.or')}<span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>

            {method === 'phone' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
                {t('login.phone')}
                <span style={{ display: 'flex', gap: 8 }}>
                  <span style={{ flex: 'none', height: 48, padding: '0 12px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>+886 <IconChevDown size={12} /></span>
                  <input inputMode="tel" autoComplete="tel" placeholder="0912 345 678" value={phone} onChange={(e) => { setPhone(e.target.value); setErr('') }} style={field} />
                </span>
              </label>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
                {t('login.email')}
                <input inputMode="email" autoComplete="email" placeholder={t('login.email_ph')} value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} style={field} />
              </label>
            )}

            {method === 'email' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
                {t('login.code')}
                <span style={{ display: 'flex', gap: 8 }}>
                  <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t('login.code_ph')} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }} style={field} />
                  <button type="button" onClick={sendEmail} disabled={busy || cool > 0} style={{ flex: 'none', height: 48, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--color-text)', background: 'transparent', fontSize: 13, fontWeight: 700, color: 'var(--color-text)', opacity: cool > 0 ? 0.5 : 1 }}>
                    {cool > 0 ? t('login.resend_in', { s: cool }) : sentTo ? t('login.resend') : t('login.send')}
                  </button>
                </span>
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-2)' }}>{sentTo ? t('login.sent', { to: sentTo }) : t('login.hint')}</span>
              </label>
            )}
            {err && <span role="alert" style={{ fontSize: 13, color: 'var(--color-error)' }}>✕ {err}</span>}
            <button type="button" disabled={busy} onClick={method === 'email' ? verifyEmail : startWa}
              style={{ height: 48, borderRadius: 24, border: 'none', background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{busy ? <IconSpinner /> : t('login.submit')}</button>
          </>
        )}
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-disabled)', textAlign: 'center', lineHeight: 1.6 }}>{t('login.agree')} <Link to="/info/terms">{t('login.terms')}</Link> {t('login.and')} <Link to="/info/terms">{t('login.privacy')}</Link></p>
        <p style={{ margin: '0 0 24px', fontSize: 13, textAlign: 'center' }}>{t('login.confused')}<Link to="/service" style={{ fontWeight: 700 }}>{t('login.ask_cs')}</Link></p>
      </section>
      <span hidden>{sized('', 1)}</span>
    </div>
  )
}
