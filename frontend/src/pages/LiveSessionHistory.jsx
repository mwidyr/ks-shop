import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listLiveSessions } from '../api/liveSessions'
import SessionStatusPill from '../components/SessionStatusPill'
import { IconArrowRight } from '../components/icons'

export default function LiveSessionHistory() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState(null)

  useEffect(() => { listLiveSessions({}).then(setSessions) }, [])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/panel-siaran" className="text-gray-500 hover:text-gray-800">←</Link>
          <h1 className="text-xl font-bold text-gray-800">{t('page_live_session_history.title')}</h1>
        </div>
        <Link to="/panel-siaran/new" className="bg-gray-800 hover:bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {t('page_live_session_history.add_session_button')}
        </Link>
      </div>

      {!sessions ? (
        <p className="text-gray-500 py-10 text-center">{t('common.loading')}</p>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_live_session_history.empty_state')}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">{t('page_live_session_history.th_session_name')}</th>
                <th className="p-3">{t('page_live_session_history.th_status')}</th>
                <th className="p-3 text-right">{t('page_live_session_history.th_live_cart')}</th>
                <th className="p-3 text-right">{t('page_live_session_history.th_order_count')}</th>
                <th className="p-3 text-right">{t('page_live_session_history.th_peak_viewers')}</th>
                <th className="p-3">{t('page_live_session_history.th_created_at')}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="p-3 font-semibold text-gray-800">{s.label}</td>
                  <td className="p-3"><SessionStatusPill status={s.status} /></td>
                  <td className="p-3 text-right">{s.cart_count}</td>
                  <td className="p-3 text-right">{s.order_count}</td>
                  <td className="p-3 text-right">{s.peak_viewers}</td>
                  <td className="p-3 text-gray-500">{new Date(s.created_at).toLocaleDateString('id-ID')}</td>
                  <td className="p-3">
                    <Link to={`/panel-siaran/${s.id}`} className="text-brand-600 font-semibold text-xs hover:underline flex items-center gap-1">
                      {t('page_live_session_history.manage_link')} <IconArrowRight width={13} height={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
