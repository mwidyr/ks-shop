import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listBatches } from '../api/shippingWorkbench'
import CreateBatchModal from '../components/shipping/CreateBatchModal'
import { BatchStatusPill, PROVIDERS, ProgressChips, StagePill, batchPath, formatDateTime, primaryBtn, providerBySlug } from '../components/shipping/shared'
import { useCanEdit } from '../context/AccessContext'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../utils/hooks'
import Pager from '../components/Pager'

const STAGES = ['pending_order_matching', 'awaiting_3pl_shipment', 'shipped_awaiting_completion', 'closed']

export default function ShippingProvider() {
  const { slug } = useParams()
  const provider = providerBySlug(slug)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [filter, setFilter] = useState('pending')
  const [q, setQ] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [data, setData] = useState({ cards: {}, batches: [], total: 0 })
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS)
  const load = useCallback(() => {
    if (provider) listBatches({ provider, filter, q: debouncedQ, sort: sortAsc ? 'oldest' : '', page, page_size: 20 }).then(setData)
  }, [provider, filter, debouncedQ, sortAsc, page])
  useEffect(() => { load() }, [load])
  // a new filter, search or sort direction starts at page 1
  useEffect(() => { setPage(1) }, [filter, debouncedQ, sortAsc])

  if (!provider) return <div className="p-8 text-center text-gray-500">{t('page_shipping_wb.unknown_provider')}</div>

  // the server returns the page already ordered: batches with problems first, then by creation date
  const list = data.batches

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-5">
      <Link to="/shipping-workbench" className="text-sm font-semibold text-brand-600 hover:underline">← {t('page_shipping_wb.title')}</Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t(`page_shipping_wb.${PROVIDERS[provider].nameKey}`)}</h1>
          <p className="text-sm text-gray-500">{t('page_shipping_wb.shipping_batches')}</p>
        </div>
        {canEdit && <button onClick={() => setCreateOpen(true)} className={primaryBtn}>+ {t('page_shipping_wb.create_new_batch')}</button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* same plain card as the Inventory Management summary cards (BigStatCard compact) */}
        {STAGES.map((stage) => (
          <div key={stage} className="bg-white rounded-xl shadow-sm p-3">
            <p className="text-xs text-gray-500 truncate">{t(`page_shipping_wb.stage_${stage}`)}</p>
            <p className="text-lg font-extrabold text-gray-800">{data.cards[stage] ?? 0}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{t('page_shipping_wb.batches_unit')}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {['pending', 'closed', 'all'].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`text-sm font-semibold px-4 py-1.5 rounded-full ${filter === f ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                {t(`page_shipping_wb.filter_${f}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('page_shipping_wb.search_batch')} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={() => setSortAsc(!sortAsc)} className="text-sm font-semibold text-gray-600 hover:underline">
              {t('page_shipping_wb.sort_date')} {sortAsc ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="text-center text-gray-400 py-10">{t('page_shipping_wb.no_batches')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 border-b">
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_batch_id')}</th>
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_created')}</th>
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_total')}</th>
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_progress')}</th>
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_unresolved')}</th>
                  <th className="py-2 pr-3">{t('page_shipping_wb.col_stage')}</th>
                  <th className="py-2">{t('page_shipping_wb.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} onClick={() => navigate(batchPath(provider, b.id))} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer align-top">
                    <td className="py-3 pr-3 font-semibold text-gray-800">
                      {b.batch_no}
                      {b.has_problems && <span className="ml-2 text-red-600" title={t('page_shipping_wb.has_problems')}>⚠</span>}
                    </td>
                    <td className="py-3 pr-3 text-gray-500 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                    <td className="py-3 pr-3">{b.counts.total}</td>
                    <td className="py-3 pr-3">
                      <ProgressChips counts={b.counts} />
                      <p className="text-[11px] text-gray-400 mt-1">{t('page_shipping_wb.matched_line', { matched: b.matched })}</p>
                    </td>
                    <td className="py-3 pr-3 font-semibold">{b.unresolved}</td>
                    <td className="py-3 pr-3"><StagePill stage={b.stage} /></td>
                    <td className="py-3"><BatchStatusPill status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} size={20} total={data.total} onPage={setPage} />
      </div>

      {createOpen && <CreateBatchModal provider={provider} onClose={() => { setCreateOpen(false); load() }} />}
    </div>
  )
}
