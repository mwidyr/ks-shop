import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { confirmAllNotCreated, confirmNotCreated, getBatch, getExportRows, recordExport } from '../api/shippingWorkbench'
import { buildPackingLabel, buildPlatformExcel, downloadBlob, exportFilename } from '../utils/shipping/excel'
import ImportBox from '../components/shipping/ImportBox'
import StatusPill from '../components/StatusPill'
import {
  BatchStatusPill, Notice, PROVIDERS, ProgressChips, SectionCard, StagePill, Stat,
  batchPath, formatDateTime, ghostBtn, primaryBtn,
} from '../components/shipping/shared'

const RESULT_KINDS = ['711_validation', '711_export', 'fm_result', 'hct_result']
const INSTRUCTION_STEPS = { cvs_711: 6, cvs_familymart: 5, courier: 5 }
const INSTRUCTION_PREFIX = { cvs_711: 'instr_711', cvs_familymart: 'instr_fm', courier: 'instr_hct' }
// which import kinds belong to the "Unmatched or conflicting records" list of each section
const ISSUE_KINDS = { results: RESULT_KINDS, shipment: ['3pl_shipment'], delivery: ['delivery'] }

// Unmatched / conflicting import rows. Repeated and overlapping imports pile these up, and they are
// rarely needed, so the list is collapsed until someone opens it.
function IssueList({ issues, kinds }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const list = issues.filter((i) => kinds.includes(i.kind))
  if (list.length === 0) return null
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline">
        <span aria-hidden>{open ? '▾' : '▸'}</span> {t('page_shipping_wb.unmatched_records')} ({list.length})
      </button>
      {open && (
        <ul className="mt-1 text-xs text-gray-600 space-y-0.5 max-h-60 overflow-y-auto">
          {list.map((i) => (
            <li key={i.id}><span className="font-semibold">{t(`page_shipping_wb.issue_import_${i.issue}`, { defaultValue: i.issue })}</span> · {i.ref}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function History({ items, render }) {
  const { t } = useTranslation()
  if (items.length === 0) return <p className="text-xs text-gray-400 mt-3">{t('page_shipping_wb.no_history')}</p>
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500 mb-1">{t('page_shipping_wb.history')}</p>
      <ul className="text-xs text-gray-600 space-y-1 max-h-44 overflow-y-auto">{items.map(render)}</ul>
    </div>
  )
}

export default function ShippingBatch() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showOrders, setShowOrders] = useState(false)

  const load = useCallback(() => getBatch(id).then(setData).catch(() => setData(false)), [id])
  useEffect(() => { load() }, [load])

  if (data === false) return <div className="p-8 text-center text-gray-500">{t('page_shipping_wb.batch_not_found')}</div>
  if (!data) return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>

  const { batch, orders, exports, imports, issues } = data
  const provider = batch.provider
  const c = batch.counts
  const byKind = (kind) => exports.filter((e) => e.kind === kind)
  const initialExports = byKind('initial')
  const firstInitial = initialExports.length ? initialExports[initialExports.length - 1] : null // oldest = the original file
  const resultImports = imports.filter((i) => RESULT_KINDS.includes(i.kind))

  const created = orders.filter((o) => o.verification === 'created').length
  const failedOrders = orders.filter((o) => o.verification === 'failed')
  const pendingVerification = orders.filter((o) => o.verification === 'pending_verification')
  const awaiting = orders.filter((o) => o.verification === 'awaiting_results').length
  const unresolvedFailed = [...failedOrders, ...pendingVerification]
  const verifiedNotSent = orders.filter((o) => o.status === 'ready_to_ship' && !o.packing_exported_at).length
  const sentTo3PL = orders.filter((o) => o.packing_exported_at).length

  async function run(label, fn) {
    setBusy(label)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('page_shipping_wb.err_import_failed'))
    } finally {
      setBusy('')
    }
  }

  // Build + download a platform file. A first-time export is recorded (orders move to Processing);
  // re-downloading an earlier file only reproduces it and records nothing.
  const downloadPlatformFile = (kind, exportedAt) => run(`dl-${kind}`, async () => {
    const res = await getExportRows(id, kind, exportedAt)
    if (res.rows.length === 0) { setError(t('page_shipping_wb.nothing_to_export')); return }
    const blob = await buildPlatformExcel(provider, res.rows)
    downloadBlob(blob, exportFilename(exportedAt ? `${kind}-again` : kind, batch.batch_no))
    if (!exportedAt) await recordExport(id, kind, res.rows.flatMap((r) => r.order_ids))
  })

  const downloadInitial = () => {
    if (firstInitial && !window.confirm(t('page_shipping_wb.confirm_redownload'))) return
    downloadPlatformFile('initial', firstInitial?.exported_at)
  }

  const downloadPacking = (exportedAt) => run('dl-pack', async () => {
    const res = await getExportRows(id, '3pl_packing', exportedAt)
    if (res.rows.length === 0) { setError(t('page_shipping_wb.nothing_to_export')); return }
    downloadBlob(await buildPackingLabel(res.rows), exportFilename(exportedAt ? '3pl-packing-again' : '3pl-packing', batch.batch_no))
    if (!exportedAt) await recordExport(id, '3pl_packing', res.rows.flatMap((r) => r.order_ids))
  })

  const resultKinds = provider === 'cvs_711' ? [['711_validation', 'upload_a'], ['711_export', 'upload_b']]
    : provider === 'cvs_familymart' ? [['fm_result', 'upload_fm']] : [['hct_result', 'upload_hct']]
  const steps = Array.from({ length: INSTRUCTION_STEPS[provider] }, (_, i) => `page_shipping_wb.${INSTRUCTION_PREFIX[provider]}_${i + 1}`)

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-5">
      <button onClick={() => navigate(`/shipping-workbench/${PROVIDERS[provider].slug}`)} className="text-sm font-semibold text-brand-600 hover:underline">
        ← {t('page_shipping_wb.back_to_list')}
      </button>

      {/* Batch header & progress */}
      <section className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{batch.batch_no}</h1>
            <p className="text-sm text-gray-500">
              {t(`page_shipping_wb.${PROVIDERS[provider].nameKey}`)} · {formatDateTime(batch.created_at)} · {batch.created_by}
            </p>
          </div>
          <div className="flex gap-2 items-center"><StagePill stage={batch.stage} /><BatchStatusPill status={batch.status} /></div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Stat label={t('page_shipping_wb.total_orders')} value={c.total} />
          {c.new > 0 && <Stat label={t('page_shipping_wb.chip_new')} value={c.new} />}
          <Stat label={t('page_shipping_wb.chip_processing')} value={c.processing} />
          <Stat label={t('page_shipping_wb.chip_ready_to_ship')} value={c.ready_to_ship} />
          <Stat label={t('page_shipping_wb.chip_shipped')} value={c.shipped} />
          <Stat label={t('page_shipping_wb.chip_completed')} value={c.completed} tone="good" />
          <Stat label={t('page_shipping_wb.chip_cancelled')} value={c.cancelled} />
          {c.returned > 0 && <Stat label={t('page_shipping_wb.chip_returned')} value={c.returned} />}
          <Stat label={t('page_shipping_wb.unresolved')} value={batch.unresolved} tone={batch.unresolved ? 'bad' : 'good'} />
        </div>
        {batch.missing_shipping_no > 0 && (
          <div className="mt-3"><Notice tone="warn">⚠ {t('page_shipping_wb.missing_shipping_warning', { count: batch.missing_shipping_no })}</Notice></div>
        )}
        <button onClick={() => setShowOrders(!showOrders)} className="mt-3 text-sm font-semibold text-gray-600 hover:underline">
          {showOrders ? '▾' : '▸'} {t('page_shipping_wb.order_list')}
        </button>
        {showOrders && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-400 uppercase border-b">
                <th className="py-1.5 pr-2">#</th><th className="pr-2">{t('page_shipping_wb.col_order')}</th><th className="pr-2">{t('page_shipping_wb.col_status')}</th>
                <th className="pr-2">{t('page_shipping_wb.platform_no')}</th><th className="pr-2">{t('page_shipping_wb.shipping_no')}</th><th>{t('page_shipping_wb.col_result')}</th>
              </tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 text-gray-400">{o.seq}</td>
                    <td className="pr-2"><Link to={`/orders/${o.order_id}`} className="font-semibold text-brand-700 hover:underline">{o.order_no}</Link><span className="text-gray-400"> {o.customer_name}</span></td>
                    <td className="pr-2"><StatusPill status={o.status} /></td>
                    <td className="pr-2 font-mono">{o.platform_order_no || '-'}</td>
                    <td className="pr-2 font-mono">{o.shipping_no || '-'}</td>
                    <td>{o.verification ? t(`page_shipping_wb.verif_${o.verification}`) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <Notice tone="bad">{error}</Notice>}

      {/* 01 Initial order export */}
      <SectionCard id="s1" step="01" title={t('page_shipping_wb.s1_title')} hint={t('page_shipping_wb.s1_hint')}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Stat label={t('page_shipping_wb.orders_in_batch')} value={c.total} />
          <Stat label={t('page_shipping_wb.export_status')} value={firstInitial ? t('page_shipping_wb.exported') : t('page_shipping_wb.not_exported')} tone={firstInitial ? 'good' : undefined} />
        </div>
        <button onClick={downloadInitial} disabled={!!busy} className={primaryBtn}>
          {busy === 'dl-initial' ? t('common.loading') : t('page_shipping_wb.download_initial')}
        </button>
        <div className="mt-3"><Notice tone="warn">{t('page_shipping_wb.duplicate_warning')}</Notice></div>
        <History items={initialExports} render={(e) => (
          <li key={e.exported_at} className="flex items-center justify-between gap-2">
            <span>{formatDateTime(e.exported_at)} · {e.user} · {t('page_shipping_wb.n_orders', { count: e.orders })}</span>
            <button onClick={() => window.confirm(t('page_shipping_wb.confirm_redownload')) && downloadPlatformFile('initial', e.exported_at)} className="font-semibold text-brand-600 hover:underline">{t('page_shipping_wb.download_again')}</button>
          </li>
        )} />
      </SectionCard>

      {/* 02 Platform instructions */}
      <SectionCard id="s2" step="02" title={t(`page_shipping_wb.s2_title_${provider}`)} hint={t('page_shipping_wb.s2_hint')}>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
          {steps.map((k) => <li key={k}>{t(k)}</li>)}
        </ol>
      </SectionCard>

      {/* 03 Initial order results import */}
      <SectionCard id="s3" step="03" title={t('page_shipping_wb.s3_title')} hint={t(`page_shipping_wb.s3_hint_${provider}`)}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Stat label={t('page_shipping_wb.matched')} value={created} tone="good" />
          <Stat label={t('page_shipping_wb.failed')} value={failedOrders.length} tone={failedOrders.length ? 'bad' : undefined} />
          <Stat label={t('page_shipping_wb.pending_verification')} value={pendingVerification.length} tone={pendingVerification.length ? 'bad' : undefined} />
          <Stat label={t('page_shipping_wb.awaiting_results')} value={awaiting} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {resultKinds.map(([kind, key]) => (
            <ImportBox key={kind} title={t(`page_shipping_wb.${key}_title`)} hint={t(`page_shipping_wb.${key}_hint`)} kinds={[kind]} provider={provider} batchId={batch.id} onDone={load} />
          ))}
        </div>
        {unresolvedFailed.length > 0 && (
          <a href="#s7" className="inline-block mt-3 text-sm font-semibold text-red-600 hover:underline">{t('page_shipping_wb.go_to_failed')} ({unresolvedFailed.length}) ↓</a>
        )}
        <History items={resultImports} render={(i) => (
          <li key={i.id}>{formatDateTime(i.created_at)} · {t(`page_shipping_wb.kind_${i.kind}`)} · {i.file_name} · {i.user} ·{' '}
            {t('page_shipping_wb.hist_summary', { updated: i.summary?.updated ?? 0, failed: i.summary?.failed ?? 0, unmatched: i.summary?.unmatched ?? 0 })}</li>
        )} />
        <IssueList issues={issues} kinds={ISSUE_KINDS.results} />
      </SectionCard>

      {/* 04 3PL packing documents */}
      <SectionCard id="s4" step="04" title={t('page_shipping_wb.s4_title')} hint={t('page_shipping_wb.s4_hint')}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Stat label={t('page_shipping_wb.verified_available')} value={verifiedNotSent} />
          <Stat label={t('page_shipping_wb.sent_to_3pl')} value={sentTo3PL} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadPacking()} disabled={!!busy || verifiedNotSent === 0} className={primaryBtn}>{t('page_shipping_wb.download_3pl_packing')}</button>
          <button disabled className={ghostBtn} title={t('page_shipping_wb.format_pending')}>{t('page_shipping_wb.download_sticker')}</button>
        </div>
        <div className="mt-3"><Notice tone="info">{t('page_shipping_wb.packing_placeholder')}</Notice></div>
        <History items={byKind('3pl_packing')} render={(e) => (
          <li key={e.exported_at} className="flex items-center justify-between gap-2">
            <span>{formatDateTime(e.exported_at)} · {e.user} · {t('page_shipping_wb.n_orders', { count: e.orders })}</span>
            <button onClick={() => downloadPacking(e.exported_at)} className="font-semibold text-brand-600 hover:underline">{t('page_shipping_wb.download_again')}</button>
          </li>
        )} />
      </SectionCard>

      {/* 05 3PL shipment confirmation */}
      <SectionCard id="s5" step="05" title={t('page_shipping_wb.s5_title')} hint={t('page_shipping_wb.s5_hint')}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Stat label={t('page_shipping_wb.total_shipped')} value={c.shipped + c.completed + c.returned} tone="good" />
          <Stat label={t('page_shipping_wb.awaiting_shipment')} value={c.ready_to_ship} />
        </div>
        <ImportBox title={t('page_shipping_wb.upload_3pl_shipment')} hint={t('page_shipping_wb.s5_upload_hint')} kinds={['3pl_shipment']} provider={provider} batchId={batch.id} onDone={load} />
        <History items={imports.filter((i) => i.kind === '3pl_shipment')} render={(i) => <li key={i.id}>{formatDateTime(i.created_at)} · {i.file_name} · {i.user}</li>} />
        <IssueList issues={issues} kinds={ISSUE_KINDS.shipment} />
      </SectionCard>

      {/* 06 Delivery completion */}
      <SectionCard id="s6" step="06" title={t('page_shipping_wb.s6_title')} hint={t('page_shipping_wb.s6_hint')}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Stat label={t('page_shipping_wb.total_completed')} value={c.completed} tone="good" />
          <Stat label={t('page_shipping_wb.awaiting_completion')} value={c.shipped} />
        </div>
        <ImportBox title={t('page_shipping_wb.upload_delivery')} hint={t('page_shipping_wb.s6_upload_hint')} kinds={['delivery']} provider={provider} batchId={batch.id} onDone={load} />
        <History items={imports.filter((i) => i.kind === 'delivery')} render={(i) => <li key={i.id}>{formatDateTime(i.created_at)} · {i.file_name} · {i.user}</li>} />
        <IssueList issues={issues} kinds={ISSUE_KINDS.delivery} />
      </SectionCard>

      {/* 07 Failed orders & retry - visually separated at the very bottom */}
      <div className="pt-6 border-t-2 border-dashed border-gray-300">
        <SectionCard id="s7" step="07" title={t('page_shipping_wb.s7_title')} hint={t('page_shipping_wb.s7_hint')} tone="danger">
          <div className="flex flex-wrap gap-2 mb-3">
            <Stat label={t('page_shipping_wb.unresolved_orders')} value={unresolvedFailed.length} tone={unresolvedFailed.length ? 'bad' : 'good'} />
            <Stat label={t('page_shipping_wb.failed')} value={failedOrders.length} />
            <Stat label={t('page_shipping_wb.pending_verification')} value={pendingVerification.length} />
          </div>
          {pendingVerification.length > 1 && (
            <button
              onClick={() => window.confirm(t('page_shipping_wb.confirm_all_not_created', { count: pendingVerification.length })) && run('cf-all', () => confirmAllNotCreated(id))}
              className={`${ghostBtn} mb-3`}
            >
              {t('page_shipping_wb.confirm_all_not_created_btn', { count: pendingVerification.length })}
            </button>
          )}
          {unresolvedFailed.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">{t('page_shipping_wb.no_failed')}</p>
          ) : (
            <ul className="divide-y bg-white rounded-xl border border-red-100">
              {unresolvedFailed.map((o) => (
                // the whole row opens the order in Order Management: staff review the details there
                // before deciding anything (cancelling is done from the order itself)
                <li key={o.order_id} onClick={() => navigate(`/orders/${o.order_id}`)} onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(`/orders/${o.order_id}`) }}
                  role="link" tabIndex={0} title={t('page_shipping_wb.open_order')}
                  className="p-3 flex items-start justify-between gap-3 flex-wrap cursor-pointer hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      <span className="text-brand-700 hover:underline">{o.order_no}</span>
                      <span className="ml-2 text-xs font-normal text-gray-500">{o.customer_name} · {o.store_name} {o.store_code}</span>
                    </p>
                    {o.verification === 'failed'
                      ? <p className="text-xs text-red-600 break-words">{o.last_error}</p>
                      : <p className="text-xs text-amber-700">{t('page_shipping_wb.verif_pending_verification_hint')}</p>}
                    {o.likely_failing && <p className="text-xs font-semibold text-red-600">⚠ {t('page_shipping_wb.likely_failing')}</p>}
                  </div>
                  <div className="flex gap-3 items-center shrink-0">
                    {o.verification === 'pending_verification' && (
                      <button onClick={(ev) => { ev.stopPropagation(); if (window.confirm(t('page_shipping_wb.confirm_not_created'))) run(`cf-${o.order_id}`, () => confirmNotCreated(id, o.order_id)) }} className="text-xs font-semibold text-brand-600 hover:underline">
                        {t('page_shipping_wb.confirm_not_created_btn')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="border border-gray-200 bg-white rounded-xl p-4 space-y-3">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{t('page_shipping_wb.retry_download_title')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('page_shipping_wb.retry_download_hint')}</p>
              </div>
              <button onClick={() => downloadPlatformFile('retry')} disabled={!!busy || failedOrders.length === 0} className={primaryBtn}>{t('page_shipping_wb.download_retry')}</button>
            </div>
            <ImportBox
              title={t('page_shipping_wb.retry_upload_title')} hint={t('page_shipping_wb.retry_upload_hint')}
              kinds={resultKinds.map(([k]) => k)} provider={provider} batchId={batch.id} onDone={load} buttonLabel={t('page_shipping_wb.upload_retry')}
            />
          </div>
          <History items={byKind('retry')} render={(e) => (
            <li key={e.exported_at}>{formatDateTime(e.exported_at)} · {e.user} · {t('page_shipping_wb.n_orders', { count: e.orders })}</li>
          )} />
        </SectionCard>
      </div>
    </div>
  )
}
