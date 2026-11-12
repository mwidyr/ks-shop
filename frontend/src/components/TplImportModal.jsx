import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyTplImport, previewTplImport } from '../api/products'
import { parseTplStockFile } from '../utils/tplStockImport'

// Review-before-apply import of the 3PL warehouse's stock report: shows System / Imported / Difference per SKU,
// the admin ticks what to apply, and nothing changes until "Apply". SKUs missing from the file are only warned about.
export default function TplImportModal({ onClose, onApplied }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [picked, setPicked] = useState({})
  const [onlyDiff, setOnlyDiff] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setBusy(true)
    try {
      const lines = await parseTplStockFile(file)
      const res = await previewTplImport(lines)
      setPreview(res)
      setPicked(Object.fromEntries(res.rows.filter((r) => r.diff !== 0).map((r) => [r.variant_id, true])))
    } catch (err) {
      const m = String(err?.message || '')
      setError(m === 'header_not_found' ? t('page_inventory.tpl_err_header') : m.startsWith('bad_qty:') ? t('page_inventory.tpl_err_qty', { sku: m.slice(8) }) : m === 'empty' ? t('page_inventory.tpl_err_empty') : t('page_inventory.tpl_err_generic'))
    } finally { setBusy(false) }
  }

  const diffRows = preview ? preview.rows.filter((r) => r.diff !== 0) : []
  const shown = preview ? (onlyDiff ? diffRows : preview.rows) : []
  const chosen = diffRows.filter((r) => picked[r.variant_id])
  const blocked = preview && (preview.unknown.length > 0 || preview.ambiguous.length > 0)

  async function apply() {
    if (chosen.length === 0) return
    if (!window.confirm(t('page_inventory.tpl_confirm', { n: chosen.length }))) return
    setBusy(true); setError('')
    try {
      const res = await applyTplImport(chosen.map((r) => ({ sku: r.sku, qty: r.after })))
      setDone(res.changed)
      onApplied?.()
    } catch { setError(t('page_inventory.tpl_err_generic')) } finally { setBusy(false) }
  }

  const warn = (title, list) => list.length > 0 && (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 mb-3">
      <p className="font-semibold">{title} ({list.length})</p>
      <p className="mt-1 break-words text-xs">{list.slice(0, 30).join(', ')}{list.length > 30 ? ` … +${list.length - 30}` : ''}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{t('page_inventory.tpl_title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="text-gray-500 text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto">
          {done !== null ? (
            <p className="text-sm text-green-700">{t('page_inventory.tpl_done', { n: done })}</p>
          ) : !preview ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">{t('page_inventory.tpl_intro')}</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50">{busy ? t('page_inventory.tpl_reading') : t('page_inventory.tpl_choose')}</button>
            </div>
          ) : (
            <div>
              {blocked && warn(t('page_inventory.tpl_blocked'), [...preview.unknown, ...preview.ambiguous])}
              {warn(t('page_inventory.tpl_missing'), preview.missing)}
              {warn(t('page_inventory.tpl_duplicate'), preview.duplicate_sku)}
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-gray-600">{t('page_inventory.tpl_summary', { diff: diffRows.length, total: preview.rows.length })}</span>
                <label className="flex items-center gap-2"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />{t('page_inventory.tpl_only_diff')}</label>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-1 w-8"><input type="checkbox" aria-label={t('page_inventory.tpl_select_all')} checked={diffRows.length > 0 && chosen.length === diffRows.length} onChange={(e) => setPicked(Object.fromEntries(diffRows.map((r) => [r.variant_id, e.target.checked])))} /></th>
                  <th>SKU</th><th className="text-right">{t('page_inventory.tpl_col_system')}</th><th className="text-right">{t('page_inventory.tpl_col_import')}</th><th className="text-right">{t('page_inventory.tpl_col_diff')}</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.variant_id} className="border-b last:border-0">
                      <td className="py-1">{r.diff !== 0 && <input type="checkbox" checked={Boolean(picked[r.variant_id])} onChange={(e) => setPicked({ ...picked, [r.variant_id]: e.target.checked })} />}</td>
                      <td className="font-mono text-xs">{r.sku}</td>
                      <td className="text-right tabular-nums">{r.before}</td>
                      <td className="text-right tabular-nums">{r.after}</td>
                      <td className={`text-right tabular-nums font-semibold ${r.diff > 0 ? 'text-green-600' : r.diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">{t('page_inventory.tpl_no_diff')}</p>}
            </div>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">{done !== null ? t('page_inventory.tpl_close') : t('page_inventory.tpl_cancel')}</button>
          {preview && done === null && (
            <button type="button" disabled={busy || blocked || chosen.length === 0} onClick={apply} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50">{t('page_inventory.tpl_apply', { n: chosen.length })}</button>
          )}
        </div>
      </div>
    </div>
  )
}
