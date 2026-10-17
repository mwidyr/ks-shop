import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdapterNotConfigured, PENDING_KINDS, PROVIDER_OF_KIND, readImportFile } from '../../utils/shipping/parsers'
import { importRecords } from '../../api/shippingWorkbench'
import { primaryBtn, Notice } from './shared'

// One upload area: reads the Excel in the browser, normalises it and sends the records to the
// backend, which matches them to ERP orders and updates them (idempotently - uploading the same
// file again changes nothing). `kinds` are the file kinds this box accepts.
export default function ImportBox({ title, hint, kinds, provider, batchId, onDone, buttonLabel }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const pending = kinds.every((k) => PENDING_KINDS.includes(k))

  async function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const parsed = await readImportFile(file, kinds.length === 1 ? kinds[0] : 'auto')
      if (!kinds.includes(parsed.kind)) throw new Error(`wrong_file:${parsed.kind}`)
      const body = {
        kind: parsed.kind,
        provider: provider || PROVIDER_OF_KIND[parsed.kind] || '',
        batch_id: batchId || null,
        file_name: parsed.fileName,
        file_hash: parsed.fileHash,
        records: parsed.records,
      }
      const res = await importRecords(body)
      setResult({ ...res.summary, kind: parsed.kind, fileName: parsed.fileName })
      onDone?.(res)
    } catch (err) {
      if (err instanceof AdapterNotConfigured) setError(t('page_shipping_wb.format_pending'))
      else if (err.message === 'unrecognised_file') setError(t('page_shipping_wb.err_unrecognised'))
      else if (err.message === 'empty_file') setError(t('page_shipping_wb.err_empty'))
      else if (err.message?.startsWith('wrong_file:')) setError(t('page_shipping_wb.err_wrong_file', { kind: t(`page_shipping_wb.kind_${err.message.split(':')[1]}`) }))
      else setError(err.response?.data?.error || t('page_shipping_wb.err_import_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {pending ? (
        <Notice tone="warn">{t('page_shipping_wb.format_pending')}</Notice>
      ) : (
        <>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFile} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={primaryBtn}>
            {busy ? t('common.loading') : (buttonLabel || t('page_shipping_wb.upload_excel'))}
          </button>
        </>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {result && <ImportResult result={result} />}
    </div>
  )
}

export function ImportResult({ result }) {
  const { t } = useTranslation()
  const items = [
    ['updated', result.updated, 'text-green-700'],
    ['skipped', result.skipped, 'text-gray-600'],
    ['failed', result.failed, 'text-red-600'],
    ['unmatched', result.unmatched, 'text-amber-700'],
    ['conflicts', result.conflicts, 'text-red-600'],
    ['missing_shipping_no', result.missing_shipping_no, 'text-amber-700'],
  ].filter(([, n]) => n > 0)
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700">{t('page_shipping_wb.import_summary', { total: result.total })}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {items.map(([key, n, cls]) => (
          <span key={key} className={`text-xs font-semibold ${cls}`}>{t(`page_shipping_wb.sum_${key}`)}: {n}</span>
        ))}
      </div>
      {result.repeat && <p className="text-xs text-amber-700 mt-1">{t('page_shipping_wb.import_repeat')}</p>}
    </div>
  )
}
