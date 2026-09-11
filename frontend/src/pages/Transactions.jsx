import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'
import { formatCurrency } from '../utils/format'

export default function Transactions() {
  const { t } = useTranslation()

  const rows = [
    { id: 'TRX-2026-091', type: t('page_transactions.type_order_payment'), amount: 949440, status: t('page_transactions.status_success') },
    { id: 'TRX-2026-092', type: t('page_transactions.type_refund'), amount: -422138, status: t('page_transactions.status_success') },
    { id: 'TRX-2026-093', type: t('page_transactions.type_order_payment'), amount: 1242419, status: t('page_transactions.status_pending') },
  ]

  return (
    <MockPage icon="💳" title={t('page_transactions.title')} description={t('page_transactions.description')}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {rows.map((t2) => (
          <div key={t2.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{t2.id}</p>
              <p className="text-xs text-gray-500">{t2.type}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${t2.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(t2.amount)}</p>
              <p className="text-xs text-gray-500">{t2.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
