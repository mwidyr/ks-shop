import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listReturns } from '../api/returns'
import { formatCurrency } from '../utils/format'

// Refunds is a read-only view over the same return requests tracked on the Returns page
// (../pages/Returns.jsx) - filed against real orders, no separate mock data of its own anymore.
const statusKeys = { active: 'processing', completed: 'completed', rejected: 'rejected' }

export default function Refunds() {
  const { t } = useTranslation()
  const [returns, setReturns] = useState([])

  useEffect(() => {
    listReturns().then(setReturns)
  }, [])

  return (
    <div className="px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1">{t('page_refunds.title')}</h1>
      <p className="text-sm text-gray-500 mb-6">{t('page_refunds.description')}</p>

      {returns.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-400">
          {t('page_refunds.empty_state')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {returns.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">{r.order_no}</p>
                <p className="text-xs text-gray-500">{r.customer_name} · {t(`page_returns.refund_type.${r.refund_type}`)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-brand-600">{formatCurrency(r.amount)}</p>
                <p className="text-xs text-gray-500">{t(`page_refunds.status.${statusKeys[r.status]}`)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
