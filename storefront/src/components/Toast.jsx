import { useTranslation } from 'react-i18next'
import { useCart } from '../lib/cart'

export default function Toast() {
  const { t } = useTranslation()
  const { toast } = useCart()
  if (!toast) return null
  const text = toast.msg === 'added' ? t('toast.added') : toast.msg
  return (
    <div
      key={toast.id} role="status" className="toast-in"
      style={{ position: 'fixed', left: '50%', bottom: 150, transform: 'translateX(-50%)', zIndex: 60, background: 'var(--color-text)', color: 'var(--color-bg)', padding: '10px 16px', borderRadius: 22, fontSize: 14, fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,.25)', whiteSpace: 'nowrap' }}
    >
      {text}
    </div>
  )
}
