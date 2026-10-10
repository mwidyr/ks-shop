import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listLiveSessions, getLiveDataCurrentCode } from '../api/liveSessions'
import SessionStatusPill from '../components/SessionStatusPill'

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
      {/* The upload page lives on the VPS address for now. */}
      <a
        href="http://116.193.191.197/live-data-upload"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
      >
        {t('page_panel_siaran.upload_live_data_button')}
      </a>
    </div>
  )
}

export default function PanelSiaran() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  function reload() {
    Promise.all([
      listLiveSessions({ status: 'draft' }),
      listLiveSessions({}),
    ]).then(([drafts, all]) => {
      setCurrent(drafts[0] || null)
      setTotal(all.length)
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
              <p className="text-xs text-gray-400 mb-2">{new Date(current.created_at).toLocaleString('id-ID')}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{t('page_panel_siaran.label_live_cart')} <span className="font-semibold">{current.cart_count}</span></span>
                <span>{t('page_panel_siaran.label_orders')} <span className="font-semibold">{current.order_count}</span></span>
              </div>
              <Link to={`/panel-siaran/${current.id}`} className="text-sm text-brand-600 font-semibold hover:underline mt-2 inline-block">
                {t('page_panel_siaran.manage_session_link')}
              </Link>
            </div>
            <SessionStatusPill status={current.status} />
          </div>
        </div>
      )}
    </div>
  )
}
