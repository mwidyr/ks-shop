import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconAlert, IconBack, IconClose, IconSpinner } from './Icons'
import { useStore } from '../lib/store'
import { waUrl } from '../lib/wa'

// ---- small building blocks shared by every page ----

export function SectionHead({ eyebrow, title, to, linkLabel, id, eyebrowColor = 'var(--color-secondary)', gap = 14 }) {
  return (
    <div style={{ padding: `0 16px ${gap}px` }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {eyebrow && <span style={{ fontSize: 11, letterSpacing: 2, color: eyebrowColor, fontWeight: 700 }}>{eyebrow}</span>}
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}><span id={id}>{title}</span></h2>
        </div>
        {to && <Link to={to} style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{linkLabel}</Link>}
      </div>
    </div>
  )
}

// Sub-page header: back + title + optional right actions (56px).
export function PageHeader({ title, back = true, onBack, right, to, height = 56, gap = 4 }) {
  const { t } = useTranslation()
  const backEl = to ? (
    <Link to={to} aria-label={t('common.back')} style={iconBtn}><IconBack /></Link>
  ) : (
    <button type="button" aria-label={t('common.back')} onClick={onBack || (() => window.history.back())} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconBack /></button>
  )
  return (
    <header style={{ height, display: 'flex', alignItems: 'center', gap, padding: '0 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 'var(--hdr-h, 0px)', zIndex: 10 }}>
      {back ? backEl : <span style={{ width: 8 }} />}
      <h1 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
      {right}
    </header>
  )
}
export const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', textDecoration: 'none', position: 'relative' }

export function Chip({ active, children, onClick, to, style }) {
  const s = {
    flex: 'none', height: 34, padding: '0 14px', borderRadius: 17, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer', boxSizing: 'content-box', fontFamily: 'inherit',
    ...(active ? { background: 'var(--color-text)', color: 'var(--color-bg)', fontWeight: 700, border: '1px solid var(--color-text)' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }),
    ...style,
  }
  if (to) return <Link to={to} style={s}>{children}</Link>
  return <button type="button" onClick={onClick} style={s}>{children}</button>
}

export const btnPrimary = {
  minHeight: 48, borderRadius: 24, background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', fontSize: 15, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 20px', textDecoration: 'none', cursor: 'pointer',
}
export const btnDark = { ...btnPrimary, background: 'var(--color-text)', color: 'var(--color-bg)' }
export const btnOutline = { ...btnPrimary, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1.5px solid var(--color-text)' }
export const btnLive = { ...btnPrimary, background: 'var(--color-live)', color: '#FFFFFF' }
export const btnWhatsApp = { ...btnPrimary, background: '#1FA855', color: '#FFFFFF' }

// ---- feedback states: loading / empty / error ----
export function Skeleton({ w = '100%', h = 16, r = 8, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />
}
export function ProductGridSkeleton({ n = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px 12px', padding: '0 16px' }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton h={0} r={14} style={{ aspectRatio: '3 / 4', height: 'auto' }} /><Skeleton h={14} /><Skeleton w="60%" h={14} />
        </div>
      ))}
    </div>
  )
}
export function Spinner({ label }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32, color: 'var(--color-text-2)' }}><IconSpinner />{label}</div>
}

export function EmptyState({ title, text, action }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <b style={{ fontSize: 17 }}>{title}</b>
      {text && <span style={{ fontSize: 14, color: 'var(--color-text-2)', lineHeight: 1.6, maxWidth: 320 }}>{text}</span>}
      {action}
    </div>
  )
}

// Error with the reason, what to do next, and a way to ask CS (never a dead end).
export function ErrorState({ title, text, onRetry, retryLabel }) {
  const { t, i18n } = useTranslation()
  const { settings } = useStore()
  return (
    <div role="alert" style={{ margin: '16px', padding: '20px 16px', borderRadius: 16, background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-error)', fontWeight: 700 }}><IconAlert size={18} />{title || t('common.error_generic')}</span>
      {text && <span style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6 }}>{text}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onRetry && <button type="button" onClick={onRetry} style={{ ...btnDark, minHeight: 44, fontSize: 14 }}>{retryLabel || t('common.retry')}</button>}
        <a href={waUrl(settings.whatsapp_number, 'ralulu')} target="_blank" rel="noreferrer" style={{ ...btnOutline, minHeight: 44, fontSize: 14 }}>{t('common.ask_cs')}</a>
      </div>
      <span hidden>{i18n.language}</span>
    </div>
  )
}

// Bottom sheet (artboards WA_Handoff / Coupon_Apply): overlay 45% under the language bar, handle, 24px radius, title + subtitle, actions at the bottom.
export function Sheet({ open, onClose, title, subtitle, icon, children, footer, maxWidth = 528 }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.45)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} className="sheet-up" style={{ position: 'relative', width: '100%', maxWidth, maxHeight: '88vh', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: '24px 24px 0 0', padding: '10px 18px 26px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: 'var(--color-border)', flex: 'none' }} />
        <button type="button" aria-label={t('common.close')} onClick={onClose} style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('common.close')}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h2>
            {subtitle && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{subtitle}</span>}
          </span>
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}

// Form field with label, hint and an error state (never colour-only: icon + text).
export function Field({ label, required, hint, error, children, htmlFor }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 14, fontWeight: 700 }}>
        {label} {required && <span style={{ color: 'var(--color-error)' }} aria-label={t('common.required')}>*</span>}
      </label>
      {children}
      {error ? (
        <span role="alert" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-error)' }}><IconAlert size={14} />{error}</span>
      ) : hint ? <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{hint}</span> : null}
    </div>
  )
}
export const inputStyle = (error) => ({
  minHeight: 48, borderRadius: 12, border: `1.5px solid ${error ? 'var(--color-error)' : 'var(--color-border-strong)'}`, background: error ? 'var(--color-error-bg)' : 'var(--color-surface)',
  padding: '0 14px', fontSize: 15, color: 'var(--color-text)', boxSizing: 'border-box', width: '100%',
})

export function Stepper({ steps, current }) {
  return (
    <ol style={{ display: 'flex', alignItems: 'center', gap: 6, listStyle: 'none', margin: 0, padding: '12px 16px', background: 'var(--color-bg)' }}>
      {steps.map((s, i) => {
        const n = i + 1
        const done = n < current
        const on = n === current
        return (
          <li key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} aria-current={on ? 'step' : undefined}>
            <span style={{ flex: 'none', width: 24, height: 24, borderRadius: 12, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done || on ? 'var(--color-primary)' : 'var(--color-bg-soft)', color: done || on ? 'var(--color-on-primary)' : 'var(--color-text-2)' }}>{done ? '✓' : n}</span>
            <span style={{ fontSize: 11, lineHeight: 1.25, fontWeight: on ? 700 : 400, color: on ? 'var(--color-text)' : 'var(--color-text-2)' }}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}
