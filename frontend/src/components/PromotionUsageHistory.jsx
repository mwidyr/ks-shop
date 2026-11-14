import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getPromotionUsage, listPromotionPurposes, listPromotions } from '../api/promotions'
import { listHosts } from '../api/hosts'
import { listLocations } from '../api/hostLocations'
import PeriodPicker, { useSharedRange } from './PeriodPicker'
import SalesChannelFilter from './SalesChannelFilter'
import CopyPhone from './CopyPhone'
import { formatCurrency } from '../utils/format'

const PAGE_SIZE = 50
const sel = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white'

// Promotion Management > Usage History: every use of a promotion on an order, with the summary of what was issued and what was
// actually used. A cancelled order stays in the list (marked) but is not counted as used.
export default function PromotionUsageHistory() {
  const { t } = useTranslation()
  const pt = (k, o) => t(`page_promotions.${k}`, o)
  const [range, setRange] = useSharedRange()
  const [channel, setChannel] = useState('all')
  const [locationId, setLocationId] = useState('')
  const [hostId, setHostId] = useState('')
  const [promotionId, setPromotionId] = useState('')
  const [purposeId, setPurposeId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [promotions, setPromotions] = useState([])
  const [purposes, setPurposes] = useState([])

  useEffect(() => {
    listLocations(true).then(setLocations).catch(() => {})
    listHosts(true).then(setHosts).catch(() => {})
    listPromotions().then(setPromotions).catch(() => {})
    listPromotionPurposes(false).then(setPurposes).catch(() => {})
  }, [])

  const params = useMemo(() => ({
    from: range.from, to: range.to,
    ...(channel !== 'all' ? { sales_channel: channel } : {}),
    ...(channel === 'live' && locationId ? { location_id: locationId } : {}),
    ...(channel === 'live' && hostId ? { host_id: hostId } : {}),
    ...(promotionId ? { promotion_id: promotionId } : {}),
    ...(purposeId ? { purpose_id: purposeId } : {}),
    ...(staffId ? { staff_id: staffId } : {}),
  }), [range, channel, locationId, hostId, promotionId, purposeId, staffId])

  // a new filter starts from the first page
  useEffect(() => { setPage(1) }, [params])
  useEffect(() => {
    let live = true
    setLoading(true)
    getPromotionUsage({ ...params, page, page_size: PAGE_SIZE }).then((d) => { if (live) setData(d) }).catch(() => { if (live) setData(null) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [params, page])

  const s = data?.summary
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const card = (label, value, sub) => (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-[11px] uppercase text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-extrabold text-gray-800 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <PeriodPicker shared value={range} onChange={setRange} />
        <SalesChannelFilter
          channel={channel} onChannelChange={(c) => { setChannel(c); setLocationId(''); setHostId('') }}
          locationId={locationId} onLocationChange={(v) => { setLocationId(v); setHostId('') }} locations={locations}
          hostId={hostId} onHostChange={setHostId} hosts={locationId ? hosts.filter((h) => String(h.location_id) === String(locationId)) : hosts}
        />
        <div className="flex flex-wrap gap-2">
          <select value={promotionId} onChange={(e) => setPromotionId(e.target.value)} className={sel} aria-label={pt('usage_filter_promotion')}>
            <option value="">{pt('usage_all_promotions')}</option>
            {promotions.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
          </select>
          <select value={purposeId} onChange={(e) => setPurposeId(e.target.value)} className={sel} aria-label={pt('usage_filter_purpose')}>
            <option value="">{pt('usage_all_purposes')}</option>
            {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ` (${pt('usage_disabled')})`}</option>)}
          </select>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={sel} aria-label={pt('usage_filter_staff')}>
            <option value="">{pt('usage_all_staff')}</option>
            {(data?.staff || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`}>
        {card(pt('usage_issued'), formatCurrency(s?.issued || 0), pt('usage_issued_hint'))}
        {card(pt('usage_used'), formatCurrency(s?.used || 0), pt('usage_used_hint'))}
        {card(pt('usage_uses'), s?.uses ?? 0, s?.cancelled_uses ? pt('usage_cancelled_count', { count: s.cancelled_uses }) : null)}
        {card(pt('usage_gmv'), formatCurrency(s?.gmv || 0), pt('usage_gmv_hint'))}
      </div>

      <div className={`bg-white rounded-2xl shadow-sm overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="p-3">{pt('usage_col_date')}</th><th>{pt('usage_col_order')}</th><th>{pt('usage_col_promotion')}</th><th>{pt('usage_col_purpose')}</th>
              <th className="text-right">{pt('usage_col_discount')}</th><th className="text-right">{pt('usage_col_gmv')}</th><th>{pt('usage_col_channel')}</th>
              <th>{pt('usage_col_staff')}</th><th className="pr-3">{pt('usage_col_phone')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.rows || []).map((r) => (
              <tr key={r.id} className={r.cancelled ? 'text-gray-400' : ''}>
                <td className="p-3 whitespace-nowrap">{new Date(r.ordered_at).toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', hour12: false }).replace(',', '')}</td>
                <td className="whitespace-nowrap">
                  <Link to={`/orders/${r.order_id}`} className="font-mono text-xs text-brand-600 hover:underline">{r.order_no}</Link>
                  {r.cancelled && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{pt('usage_cancelled')}</span>}
                </td>
                <td>{r.promotion}{r.code && r.code !== r.promotion && <span className="ml-1 font-mono text-[10px] text-gray-400">{r.code}</span>}</td>
                <td>{r.purpose || '—'}</td>
                <td className={`text-right tabular-nums ${r.cancelled ? 'line-through' : ''}`}>{formatCurrency(r.amount)}</td>
                <td className="text-right tabular-nums">{formatCurrency(r.gmv)}</td>
                <td className="whitespace-nowrap">{t(`shared.sales_channel_${r.sales_channel}`, r.sales_channel)}{r.hosts && <span className="block text-[11px] text-gray-400">{r.hosts}</span>}</td>
                <td>{r.applied_by || '—'}</td>
                <td className="pr-3"><CopyPhone phone={r.customer_phone} /></td>
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">{pt('usage_empty')}</td></tr>}
            {!data && !loading && <tr><td colSpan={9} className="p-8 text-center text-red-500">{pt('usage_load_failed')}</td></tr>}
          </tbody>
        </table>
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between p-3 text-sm text-gray-500 border-t">
            <span>{pt('usage_page', { page, pages, total: data.total })}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40">{pt('usage_prev')}</button>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40">{pt('usage_next')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
