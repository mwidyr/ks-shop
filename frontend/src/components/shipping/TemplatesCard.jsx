import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activateTemplate, getTemplates, uploadTemplate } from '../../api/shippingWorkbench'
import { ghostBtn, primaryBtn } from './shared'

const NAME_KEY = { cvs_711: 'tpl_711', cvs_familymart: 'tpl_familymart' }
const ACCEPT = { cvs_711: '.xlsm', cvs_familymart: '.xlsx' }

const fmt = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '')

function ProviderRow({ item, canEdit, onChanged }) {
  const { t } = useTranslation()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { ok, text }

  async function run(fn, okText) {
    setBusy(true); setMessage(null)
    try {
      await fn()
      setMessage({ ok: true, text: okText })
      onChanged()
    } catch (err) {
      setMessage({ ok: false, text: err.response?.data?.error || t('page_shipping_wb.err_import_failed') })
    } finally {
      setBusy(false)
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) run(() => uploadTemplate(item.provider, file), t('page_shipping_wb.tpl_uploaded'))
  }

  const active = item.active
  return (
    <li className="py-3 space-y-2" data-testid={`tpl-${item.provider}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-gray-800 text-sm">{t(`page_shipping_wb.${NAME_KEY[item.provider]}`)}</p>
          {active ? (
            <p className="text-xs text-gray-500">
              {active.filename}{active.version ? ` · ${t('page_shipping_wb.tpl_version', { v: active.version })}` : ''} · {fmt(active.uploaded_at)}{active.uploaded_by ? ` · ${active.uploaded_by}` : ''}
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              {t('page_shipping_wb.tpl_builtin')}{item.builtin_version ? ` · ${t('page_shipping_wb.tpl_version', { v: item.builtin_version })}` : ''}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <input ref={input} type="file" accept={ACCEPT[item.provider]} className="hidden" onChange={onFile} data-testid={`tpl-file-${item.provider}`} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={primaryBtn}>{t('page_shipping_wb.tpl_upload')}</button>
            {active && (
              <button type="button" disabled={busy} className={ghostBtn}
                onClick={() => window.confirm(t('page_shipping_wb.tpl_builtin_confirm')) && run(() => activateTemplate(item.provider, 'builtin'), t('page_shipping_wb.tpl_switched'))}>
                {t('page_shipping_wb.tpl_use_builtin')}
              </button>
            )}
          </div>
        )}
      </div>
      {message && <p className={`text-xs ${message.ok ? 'text-green-700' : 'text-red-600'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      {item.history.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">{t('page_shipping_wb.tpl_history')}</summary>
          <ul className="mt-1 space-y-1">
            {item.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span>{h.filename}{h.version ? ` · ${t('page_shipping_wb.tpl_version', { v: h.version })}` : ''} · {fmt(h.uploaded_at)}{h.uploaded_by ? ` · ${h.uploaded_by}` : ''}</span>
                {canEdit && (
                  <button type="button" disabled={busy} className="text-brand-600 hover:underline"
                    onClick={() => run(() => activateTemplate(item.provider, h.id), t('page_shipping_wb.tpl_switched'))}>
                    {t('page_shipping_wb.tpl_restore')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

export default function TemplatesCard({ canEdit }) {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const load = useCallback(() => { getTemplates().then(setItems).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  if (items.length === 0) return null
  return (
    <section className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-bold text-gray-800">{t('page_shipping_wb.tpl_title')}</h2>
      <p className="text-xs text-gray-400 mb-1">{t('page_shipping_wb.tpl_hint')}</p>
      <ul className="divide-y">
        {items.map((it) => <ProviderRow key={it.provider} item={it} canEdit={canEdit} onChanged={load} />)}
      </ul>
    </section>
  )
}
