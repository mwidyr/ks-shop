import { useTranslation } from 'react-i18next'
import { IconHeadset } from './Icons'
import { Sheet } from './ui'

// Bottom sheet of every CS button: the message that will be sent, then one button per chat app.
export default function CsSheet({ open, text, channels, onClose }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} title={t('cs.sheet_title')} subtitle={t('cs.sheet_hint')}
      icon={<span style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><IconHeadset size={22} /></span>}
      footer={<button type="button" onClick={onClose} style={{ minHeight: 44, borderRadius: 22, border: '1.5px solid var(--color-text)', background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{t('common.close')}</button>}>
      {text && (
        <div style={{ padding: 12, borderRadius: 16, background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)' }}>{t('cs.preview')}</span>
          <span data-testid="cs-message" style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {channels.map(({ key, label, color, Icon, url }) => (
          <a key={key} data-testid={`cs-${key}`} href={url} target="_blank" rel="noreferrer" onClick={onClose}
            style={{ minHeight: 52, borderRadius: 26, background: color, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
            <Icon size={24} stroke="#FFFFFF" />{t('cs.open_in', { app: label })}
          </a>
        ))}
        {channels.length === 0 && <span role="status" style={{ fontSize: 13, color: 'var(--color-warning)' }}>{t('final.no_channel')}</span>}
      </div>
    </Sheet>
  )
}
