import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestRestock } from '../lib/api'
import { btnPrimary, Field, inputStyle, Sheet } from './ui'

// "Notify me when it is back": stores the visitor's phone / WhatsApp for the team (Ralulu Hub > Customer requests).
export default function RestockSheet({ open, onClose, productId, variantId }) {
  const { t } = useTranslation()
  const [contact, setContact] = useState('')
  const [state, setState] = useState('idle')
  async function submit() {
    if (contact.trim().length < 5) { setState('error'); return }
    setState('sending')
    try { await requestRestock({ product_id: productId, variant_id: variantId || null, contact }); setState('done') } catch { setState('fail') }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('product.restock')}
      footer={state === 'done' ? null : <button type="button" onClick={submit} disabled={state === 'sending'} style={{ ...btnPrimary, width: '100%' }}>{t('common.continue')}</button>}>
      {state === 'done' ? <b>{t('product.restock_sent')}</b> : (
        <Field label={t('product.restock_contact')} error={state === 'error' ? t('common.required') : state === 'fail' ? t('common.error_generic') : ''}>
          <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="tel" style={inputStyle(state === 'error' || state === 'fail')} />
        </Field>
      )}
    </Sheet>
  )
}
