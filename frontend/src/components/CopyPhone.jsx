import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../utils/clipboard'

// A customer phone number with a one-click copy icon next to it. The click never bubbles (the number sits
// inside clickable table rows) and the icon turns into a check mark for a moment once copied.
export default function CopyPhone({ phone, className = '', textClassName = '', prefix = null }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!phone) return null

  async function copy(e) {
    e.stopPropagation()
    e.preventDefault()
    if (await copyToClipboard(phone)) {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={textClassName}>{prefix}{phone}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={t('page_orders.copy_phone_aria', { phone })}
        title={copied ? t('page_orders.phone_copied') : t('page_orders.copy_phone_aria', { phone })}
        className={`shrink-0 rounded p-0.5 hover:bg-gray-100 ${copied ? 'text-green-600' : 'text-gray-400 hover:text-brand-600'}`}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
    </span>
  )
}
