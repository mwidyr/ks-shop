import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listLiveSessions, getLiveDataCurrentCode } from '../api/liveSessions'
import SessionStatusPill from '../components/SessionStatusPill'
import { useAccess } from '../context/AccessContext'
import { jakartaDateTime, jakartaDateTimeParts } from '../utils/jakartaDate'
import { listLocations } from '../api/hostLocations'
import { listHosts } from '../api/hosts'
import { listUploadHistory } from '../api/liveSessions'
import Pager from '../components/Pager'
import { cardClasses, tableClasses, theadRowClasses, tbodyClasses, rowClasses } from '../components/Table'

function LiveDataCodeCard() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)

  function reload() {
    getLiveDataCurrentCode().then(setData).catch(() => setData(null))
  }

  // Refetched every minute, not just on mount - the code rotates hourly, and staff may leave
  // this page open across a rotation boundary.
  useEffect(() => {
    reload()
    const id = setInterval(reload, 60000)
    return () => clearInterval(id)
  }, [])

  if (!data) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-amber-800">
        🔑 <span className="font-semibold">{t('page_panel_siaran.live_data_code_label')}:</span>{' '}
        <span className="font-mono font-bold text-base">{data.code}</span>
        {' '}<span className="text-amber-700">{t('page_panel_siaran.live_data_code_rotates', { minutes: data.minutes_until_rotate })}</span>
      </p>
      {/* Same origin as this admin: admin.ralulu.com in production, the testing server's address in staging */}
      <a
        href="/live-data-upload"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
      >
        {t('page_panel_siaran.upload_live_data_button')}
      </a>
    </div>
  )
}

// Who has uploaded their LIVE data and when: Location first, then only that Location's Hosts.
function UploadHistory() {
  const { t } = useTranslation()
  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [locationId, setLocationId] = useState('')
  const [hostId, setHostId] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const SIZE = 25

  useEffect(() => { listLocations().then(setLocations) }, [])
  useEffect(() => { listHosts(false, locationId || undefined).then(setHosts) }, [locationId])
  useEffect(() => {
    setData(null)
    listUploadHistory({ location_id: locationId, host_id: hostId, page, page_size: SIZE }).then(setData).catch(() => setData({ items: [], total: 0 }))
  }, [locationId, hostId, page])

  const select = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400'
  return (
    <div className={`${cardClasses} p-5 mt-4`}>
      <h2 className="font-bold text-[var(--text-primary)] mb-3">{t('page_panel_siaran.upload_history_title')}</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setHostId(''); setPage(1) }} className={select}>
          <option value="">{t('page_performance_dashboard.all_locations')}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select
          value={hostId} onChange={(e) => { setHostId(e.target.value); setPage(1) }} disabled={!locationId}
          title={!locationId ? t('page_order_create.select_location_first') : undefined} className={select}
        >
          <option value="">{t('page_product_analytics.all_hosts')}</option>
          {hosts.filter((h) => String(h.location_id) === String(locationId)).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>
      {!data ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{t('common.loading')}</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{t('page_panel_siaran.upload_history_empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClasses}>
            <thead>
              <tr className={theadRowClasses}>
                <th className="p-3">{t('page_panel_siaran.upload_col_host')}</th>
                <th className="p-3">{t('page_panel_siaran.upload_col_location')}</th>
                <th className="p-3">{t('page_panel_siaran.upload_col_date')}</th>
                <th className="p-3">{t('page_panel_siaran.upload_col_time')}</th>
              </tr>
            </thead>
            <tbody className={tbodyClasses}>
              {data.items.map((u) => {
                const { date, time } = jakartaDateTimeParts(u.uploaded_at)
                return (
                  <tr key={u.session_id} className={rowClasses}>
                    <td className="p-3 font-semibold text-[var(--text-primary)]">{u.host_name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{u.location_name}</td>
                    <td className="p-3 tnum text-[var(--text-secondary)]">{date}</td>
                    <td className="p-3 tnum text-[var(--text-secondary)]">{time}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} size={SIZE} total={data?.total || 0} onPage={setPage} />
    </div>
  )
}

export default function PanelSiaran() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const isHost = useAccess().role === 'host' // a Host account sees the code and the list, not the session editor

  function reload() {
    // the newest draft and the number of sessions: one row and a count each, not the whole history
    Promise.all([
      listLiveSessions({ status: 'draft', page: 1, page_size: 1 }),
      listLiveSessions({ page: 1, page_size: 1 }),
    ]).then(([drafts, all]) => {
      setCurrent(drafts.items[0] || null)
      setTotal(all.total)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  if (loading) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">{t('page_panel_siaran.title')}</h1>
        <Link to="/panel-siaran/history" className="text-sm text-gray-500 hover:text-brand-600">
          {t('page_panel_siaran.history_link', { count: total })}
        </Link>
      </div>

      <LiveDataCodeCard />

      {current && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">{t('page_panel_siaran.label_upcoming')}</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-gray-800">{current.label}</p>
              <p className="text-xs text-gray-400 mb-2"><span className="tnum">{jakartaDateTime(current.created_at)}</span></p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{t('page_panel_siaran.label_live_cart')} <span className="font-semibold">{current.cart_count}</span></span>
                <span>{t('page_panel_siaran.label_orders')} <span className="font-semibold">{current.order_count}</span></span>
              </div>
              {!isHost && (
                <Link to={`/panel-siaran/${current.id}`} className="text-sm text-brand-600 font-semibold hover:underline mt-2 inline-block">
                  {t('page_panel_siaran.manage_session_link')}
                </Link>
              )}
            </div>
            <SessionStatusPill status={current.status} />
          </div>
        </div>
      )}

      <UploadHistory />
    </div>
  )
}
