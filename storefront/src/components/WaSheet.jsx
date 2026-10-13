import { useTranslation } from 'react-i18next'
import { img, onImgError, sized } from '../lib/api'
import { Sheet } from './ui'

const icon = (size, stroke = '#FFFFFF') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c.3 2 1.8 3.8 4.3 4.6l1.2-1.1 1.8.8-.4 1.6c-3.6.2-7-3-7.2-6.6l1.6-.5.8 1.8z" /></svg>
)
const text = (s) => s

// "Open WhatsApp" confirmation (artboard WA_Handoff): shows exactly the message that will be sent (+ the product link preview), then opens wa.me.
export default function WaSheet({ open, onClose, title, subtitle, message, url, number, preview, note }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} title={title || t('service.wa_title')} subtitle={subtitle || t('service.wa_hint')}
      icon={<span style={{ width: 40, height: 40, borderRadius: 20, background: '#1FA855', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon(20)}</span>}
      footer={<>
        {number
          ? <a href={url} target="_blank" rel="noreferrer" onClick={onClose} style={{ minHeight: 52, padding: '0 18px', borderRadius: 22, background: '#1FA855', color: '#FFFFFF', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box' }}>{icon(20)}{t('service.wa_open')}</a>
          : <span role="alert" style={{ color: 'var(--color-error)' }}>{t('service.wa_missing')}</span>}
        <button type="button" onClick={onClose} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, border: '1.5px solid var(--color-text)', background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>{t('service.wa_stay')}</button>
      </>}>
      <div style={{ padding: 12, borderRadius: 16, background: 'var(--color-success-bg)', border: '1px solid var(--color-success-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>{t('service.wa_preview')}</span>
        <div style={{ alignSelf: 'flex-end', maxWidth: 280, borderRadius: '12px 12px 4px 12px', background: 'var(--color-surface)', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
          {preview && (
            <div style={{ display: 'flex', gap: 10, padding: 8, background: '#F3F3F3' }}>
              <img src={sized(img(preview.image), 120)} alt="" onError={onImgError} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
              <span style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}><b>{preview.title}</b><span style={{ color: 'var(--color-text-2)' }}>{preview.link}</span></span>
            </div>
          )}
          <div style={{ padding: '8px 10px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{text(message)}</div>
        </div>
      </div>
      {note && <span style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{note}</span>}
    </Sheet>
  )
}
