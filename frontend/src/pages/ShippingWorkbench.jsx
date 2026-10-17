import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { getIssues, getOverview, getSettings, listBatches, resolveIssue, saveSettings } from '../api/shippingWorkbench'
import CrossBatchImportModal from '../components/shipping/CrossBatchImportModal'
import { BatchStatusPill, PROVIDERS, PROVIDER_KEYS, ProgressChips, StagePill, batchPath, elapsed, ghostBtn, primaryBtn } from '../components/shipping/shared'

const FIGURES = [
  ['ready_to_export', 'fig_ready_to_export'],
  ['insufficient_stock', 'fig_insufficient'],
  ['processing', 'fig_processing'],
  ['ready_to_ship', 'fig_ready_to_ship'],
  ['shipped', 'fig_shipped'],
]

function SettingsModal({ onClose }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ processing_hours: 24, ready_hours: 48 })
  const [error, setError] = useState('')
  useEffect(() => { getSettings().then(setForm) }, [])
  async function save() {
    try {
      await saveSettings({ processing_hours: Number(form.processing_hours), ready_hours: Number(form.ready_hours) })
      onClose(true)
    } catch (err) {
      setError(err.response?.data?.error || t('page_shipping_wb.err_import_failed'))
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onClose(false)}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800">{t('page_shipping_wb.alert_settings')}</h2>
        <p className="text-sm text-gray-500">{t('page_shipping_wb.alert_settings_desc')}</p>
        {[['processing_hours', 'alert_processing_hours'], ['ready_hours', 'alert_ready_hours']].map(([key, label]) => (
          <label key={key} className="block text-sm text-gray-600">
            {t(`page_shipping_wb.${label}`)}
            <input type="number" min="1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={() => onClose(false)} className={ghostBtn}>{t('common.cancel')}</button>
          <button onClick={save} className={primaryBtn}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}

export default function ShippingWorkbench() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [overview, setOverview] = useState([])
  const [issues, setIssues] = useState({ total: 0, items: [] })
  const [issueLimit, setIssueLimit] = useState(5)
  const [batches, setBatches] = useState([])
  const [batchLimit, setBatchLimit] = useState(5)
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const loadIssues = useCallback((limit) => getIssues({ limit }).then(setIssues), [])
  const loadAll = useCallback(() => {
    getOverview().then(setOverview)
    loadIssues(issueLimit)
    listBatches({ filter: 'pending' }).then((res) => setBatches(res.batches))
  }, [issueLimit, loadIssues])

  useEffect(() => { loadAll() }, [loadAll])

  const byProvider = Object.fromEntries(overview.map((o) => [o.provider, o]))

  function issueTarget(it) {
    if (it.order_id) return `/orders/${it.order_id}`
    return it.batch_id ? batchPath(it.provider, it.batch_id) : null
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">{t('page_shipping_wb.title')}</h1>
        <div className="flex gap-2">
          {user?.role === 'super_user' && <button onClick={() => setSettingsOpen(true)} className={ghostBtn}>⚙ {t('page_shipping_wb.alert_settings')}</button>}
          <button onClick={() => setImportOpen(true)} className={primaryBtn}>{t('page_shipping_wb.cross_batch_import')}</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {PROVIDER_KEYS.map((key) => {
          const ov = byProvider[key] || {}
          return (
            <div key={key} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col">
              <span className={`self-start text-sm font-bold px-3 py-1 rounded-full border ${PROVIDERS[key].accent}`}>
                {t(`page_shipping_wb.${PROVIDERS[key].nameKey}`)}
              </span>
              <dl className="mt-4 space-y-2 flex-1">
                {FIGURES.map(([field, label]) => (
                  <div key={field} className="flex items-center justify-between text-sm">
                    <dt className="text-gray-500">{t(`page_shipping_wb.${label}`)}</dt>
                    <dd className={`font-bold ${field === 'insufficient_stock' && ov[field] > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{ov[field] ?? '-'}</dd>
                  </div>
                ))}
              </dl>
              <button onClick={() => navigate(`/shipping-workbench/${PROVIDERS[key].slug}`)} className={`${primaryBtn} mt-4`}>
                {t('page_shipping_wb.enter_workspace')}
              </button>
            </div>
          )
        })}
      </div>

      <section className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">{t('page_shipping_wb.pending_issues')} <span className="text-sm font-normal text-gray-400">({issues.total})</span></h2>
        </div>
        {issues.items.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('page_shipping_wb.no_issues')}</p>
        ) : (
          <ul className="divide-y">
            {issues.items.map((it, i) => {
              const target = issueTarget(it)
              return (
                <li key={`${it.type}-${it.order_id || it.import_issue_id}-${i}`} className="py-2.5 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {target ? <Link to={target} className="hover:underline text-brand-700">{it.order_no}</Link> : it.order_no}
                      <span className="ml-2 text-xs font-medium text-gray-400">{it.provider && t(`page_shipping_wb.${PROVIDERS[it.provider]?.nameKey}`)}</span>
                    </p>
                    <p className="text-xs text-red-600 font-semibold">{t(`page_shipping_wb.issue_${it.type}`, { defaultValue: it.type })}</p>
                    {it.message && <p className="text-xs text-gray-500 break-words">{it.message}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{t('page_shipping_wb.pending_for', { time: elapsed(it.since) })}</p>
                    <div className="flex gap-3 justify-end mt-1">
                      {it.batch_id && <Link to={batchPath(it.provider, it.batch_id)} className="text-xs font-semibold text-brand-600 hover:underline">{it.batch_no}</Link>}
                      {it.import_issue_id && (
                        <button onClick={() => resolveIssue(it.import_issue_id).then(loadAll)} className="text-xs font-semibold text-gray-500 hover:underline">{t('page_shipping_wb.mark_resolved')}</button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {issues.total > issues.items.length && (
          <div className="flex gap-4 mt-3">
            <button onClick={() => setIssueLimit(issueLimit + 5)} className="text-sm font-semibold text-brand-600 hover:underline">{t('page_shipping_wb.show_more')}</button>
            <button onClick={() => setIssueLimit(500)} className="text-sm font-semibold text-gray-500 hover:underline">{t('page_shipping_wb.view_all')}</button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">{t('page_shipping_wb.unfinished_batches')}</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('page_shipping_wb.no_unfinished')}</p>
        ) : (
          <ul className="divide-y">
            {batches.slice(0, batchLimit).map((b) => (
              <li key={b.id}>
                <Link to={batchPath(b.provider, b.id)} className="block py-3 hover:bg-gray-50 rounded-lg px-2 -mx-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{b.batch_no}
                        <span className="ml-2 text-xs font-medium text-gray-400">{t(`page_shipping_wb.${PROVIDERS[b.provider].nameKey}`)}</span>
                      </p>
                      <p className="text-xs text-gray-400">{t('page_shipping_wb.created_on', { date: b.created_at.slice(0, 10) })}</p>
                    </div>
                    <StagePill stage={b.stage} />
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
                    <ProgressChips counts={b.counts} />
                    <p className="text-xs text-gray-500">
                      {t('page_shipping_wb.batch_line', { total: b.counts.total, matched: b.matched, remaining: b.unresolved })}
                      {b.has_problems && <span className="ml-2 font-semibold text-red-600">⚠ {t('page_shipping_wb.has_problems')}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {batches.length > batchLimit && (
          <button onClick={() => setBatchLimit(batches.length)} className="text-sm font-semibold text-brand-600 hover:underline mt-3">{t('page_shipping_wb.view_all')}</button>
        )}
      </section>

      {importOpen && <CrossBatchImportModal onClose={() => setImportOpen(false)} onDone={loadAll} />}
      {settingsOpen && <SettingsModal onClose={(changed) => { setSettingsOpen(false); if (changed) loadAll() }} />}
    </div>
  )
}
