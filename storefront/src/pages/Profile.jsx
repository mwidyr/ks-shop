import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clearProfile, useProfile } from '../lib/profile'
import { patchProfile } from '../lib/api'
import { useMember } from '../lib/member'
import { useSeo } from '../lib/seo'
import { btnDark, btnOutline, btnPrimary, Field, inputStyle, PageHeader } from '../components/ui'
import { LANGS } from '../lib/lang'

const card = { margin: '12px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }
const h2 = { margin: 0, fontSize: 15, fontWeight: 700 }
const head = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const linkBtn = { background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)', fontSize: 15 }
const tag = { padding: '2px 6px', borderRadius: 4, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 11, fontWeight: 700 }
const xBtn = { flex: 'none', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, color: 'var(--color-text-3)' }
const X = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
const mmdd = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : '')

// A read-only looking row that turns into an input when tapped.
function EditRow({ label, value, shown, onSave, type = 'text', inputMode, children }) {
  const [on, setOn] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const done = () => { setOn(false); if (v !== value) onSave(v) }
  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--color-text-2)' }}>{label}</span>
      {on ? (
        <input autoFocus type={type} inputMode={inputMode} aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={{ ...inputStyle(false), height: 36, width: 190, textAlign: 'right', padding: '0 10px' }} />
      ) : (
        <span role="button" tabIndex={0} onClick={() => setOn(true)} onKeyDown={(e) => { if (e.key === 'Enter') setOn(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, cursor: 'text' }}>{shown ?? value}{children}</span>
      )}
    </div>
  )
}

// Profile (artboard Profile): basics, login methods, favourite stores, addresses, language (+ size data for size hints).
export default function Profile() {
  const { t, i18n } = useTranslation()
  const { profile, save } = useProfile()
  const { me, signedIn, refresh } = useMember()
  const [addr, setAddr] = useState(null)
  const [body, setBody] = useState({ height: profile.height, weight: profile.weight })
  const [saved, setSaved] = useState(false)
  useSeo({ title: t('profile.title'), noindex: true })
  const name = signedIn ? (me.name ?? profile.name) : profile.name
  const phone = signedIn ? (me.phone ? `+${me.phone}` : profile.phone) : profile.phone
  const email = signedIn ? (me.email || profile.email) : profile.email
  const birthday = (signedIn && me.birthday) || profile.birthday

  const commit = async (patch) => {
    save(patch)
    if (signedIn) {
      try { await patchProfile({ name: patch.name ?? name, birthday: (patch.birthday ?? birthday) || '', profile: { height: profile.height, weight: profile.weight, addresses: profile.addresses, stores: profile.stores, ...patch } }); refresh() } catch { /* kept on the device */ }
    }
  }
  const cur = LANGS.find((l) => l.code === i18n.language)
  const setDefault = (i) => save({ stores: profile.stores.map((s, j) => ({ ...s, isDefault: j === i })) })
  const removeStore = (i) => save({ stores: profile.stores.filter((_, j) => j !== i) })
  const saveAddr = () => { if (addr.text.trim().length >= 6) { save({ addresses: [...profile.addresses, addr] }); setAddr(null) } }
  const chainName = (c) => (c === 'cvs_711' ? '7-ELEVEN' : 'FamilyMart')

  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('profile.title')} to="/member" />
      {!signedIn && <p style={{ margin: '12px 16px 0', fontSize: 12, color: 'var(--color-text-2)' }}>{t('profile.guest_note')}</p>}
      <section style={card}>
        <div style={head}><h2 style={h2}>{t('profile.basic')}</h2></div>
        <div>
          <EditRow label={t('profile.name')} value={name || ''} onSave={(v) => commit({ name: v })} />
          <EditRow label={t('profile.phone')} value={phone || ''} inputMode="tel" onSave={(v) => commit({ phone: v })}>{signedIn && me.phone && <span style={tag}>{t('mc.verified')}</span>}</EditRow>
          <EditRow label={t('profile.email')} value={email || ''} inputMode="email" onSave={(v) => commit({ email: v })} />
          <EditRow label={t('profile.birthday')} value={birthday || ''} type="date" shown={`${mmdd(birthday)}${birthday ? '・' : ''}${t('mc.birthday_note')}`} onSave={(v) => commit({ birthday: v })} />
        </div>
      </section>
      {signedIn && (
        <section style={card}>
          <div style={head}><h2 style={h2}>{t('mc.login_methods')}</h2></div>
          <div>
            <div style={rowStyle}><span style={{ color: 'var(--color-text-2)' }}>WhatsApp</span><span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>{me.phone ? <>{`+${me.phone}`}<span style={tag}>{t('mc.wa_connected')}</span></> : t('mc.not_connected')}</span></div>
            <div style={rowStyle}><span style={{ color: 'var(--color-text-2)' }}>Email</span><span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>{me.email ? <>{me.email}<span style={tag}>{t('mc.verified')}</span></> : t('mc.not_connected')}</span></div>
          </div>
        </section>
      )}
      <section style={card}>
        <div style={head}><h2 style={h2}>{t('profile.stores')}</h2><Link to="/checkout" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('profile.add_store')}</Link></div>
        {profile.stores.map((s, i) => (
          <div key={`${s.chain}-${s.code}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12, border: s.isDefault ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: s.isDefault ? 'var(--color-primary-soft)' : 'var(--color-surface)' }}>
            <span style={{ flex: 'none', padding: '3px 6px', borderRadius: 6, background: 'var(--color-surface)', border: '1.5px dashed var(--color-border-strong)', color: 'var(--color-text)', fontSize: 11, fontWeight: 700 }} aria-label={chainName(s.chain)}>{chainName(s.chain)}</span>
            <button type="button" onClick={() => setDefault(i)} aria-pressed={Boolean(s.isDefault)} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch', textAlign: 'left', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', color: 'var(--color-text)', cursor: 'pointer' }}>
              <b style={{ fontSize: 15 }}>{s.name || '—'}{s.isDefault ? t('profile.store_default') : ''}</b>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{s.addr}{s.addr ? '・' : ''}{t('profile.store_no', { code: s.code })}</span>
            </button>
            <button type="button" aria-label={t('profile.remove')} onClick={() => removeStore(i)} style={xBtn}>{X}</button>
          </div>
        ))}
        <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{profile.stores.length === 0 ? t('profile.stores_empty') : t('profile.store_hint')}</span>
      </section>
      <section style={card}>
        <div style={head}><h2 style={h2}>{t('profile.addresses')}</h2><button type="button" onClick={() => setAddr({ name, phone: phone || '', text: '' })} style={{ ...linkBtn, textDecoration: 'none' }}>{t('profile.add')}</button></div>
        {profile.addresses.length === 0 && !addr && <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('profile.addr_empty')}</span>}
        {profile.addresses.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 15, lineHeight: 1.6 }}>{a.name}・{a.phone}<br /><span style={{ color: 'var(--color-text-2)' }}>{a.text}</span></div>
            <button type="button" aria-label={t('profile.remove')} onClick={() => save({ addresses: profile.addresses.filter((_, j) => j !== i) })} style={xBtn}>{X}</button>
          </div>
        ))}
        {addr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input aria-label={t('profile.addr_name')} placeholder={t('profile.addr_name')} value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} style={inputStyle(false)} />
            <input aria-label={t('profile.addr_phone')} placeholder={t('profile.addr_phone')} value={addr.phone} inputMode="tel" onChange={(e) => setAddr({ ...addr, phone: e.target.value })} style={inputStyle(false)} />
            <textarea aria-label={t('profile.addr_text')} placeholder={t('profile.addr_text')} rows={3} value={addr.text} onChange={(e) => setAddr({ ...addr, text: e.target.value })} style={{ ...inputStyle(false), minHeight: 80, padding: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={saveAddr} style={{ ...btnDark, flex: 1 }}>{t('profile.save')}</button><button type="button" onClick={() => setAddr(null)} style={{ ...btnOutline, flex: 1 }}>{t('common.cancel')}</button></div>
          </div>
        )}
      </section>
      <section style={card}>
        <div style={head}><h2 style={h2}>{t('profile.lang')}</h2></div>
        <Link to="/language" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', color: 'var(--color-text)', fontSize: 15 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>{cur?.short}
          </span><span>›</span>
        </Link>
      </section>
      <section style={card}>
        <div style={head}><h2 style={h2}>{t('profile.body')}</h2></div>
        <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('profile.body_hint')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('profile.height')} htmlFor="p-h"><input id="p-h" inputMode="numeric" value={body.height} onChange={(e) => { setBody({ ...body, height: e.target.value.replace(/\D/g, '') }); setSaved(false) }} style={inputStyle(false)} /></Field>
          <Field label={t('profile.weight')} htmlFor="p-w"><input id="p-w" inputMode="numeric" value={body.weight} onChange={(e) => { setBody({ ...body, weight: e.target.value.replace(/\D/g, '') }); setSaved(false) }} style={inputStyle(false)} /></Field>
        </div>
        <button type="button" onClick={async () => { await commit({ height: body.height, weight: body.weight }); setSaved(true) }} style={btnPrimary}>{saved ? `✓ ${t('profile.saved')}` : t('profile.save')}</button>
      </section>
      <button type="button" onClick={() => { if (window.confirm(t('profile.clear_confirm'))) { clearProfile(); setBody({ height: '', weight: '' }) } }}
        style={{ margin: '16px', background: 'none', border: 'none', color: 'var(--color-error)', fontSize: 13, textDecoration: 'underline' }}>{t('profile.clear')}</button>
    </div>
  )
}
