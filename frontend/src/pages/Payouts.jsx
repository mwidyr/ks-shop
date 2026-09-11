import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'
import { formatCurrency } from '../utils/format'

export default function Payouts() {
  const { t } = useTranslation()

  const payouts = [
    { period: '1-7 Sep 2026', amount: 8450000, status: t('page_payouts.status_paid'), date: '8 Sep 2026' },
    { period: '8-14 Sep 2026', amount: 6120000, status: t('page_payouts.status_processing'), date: t('page_payouts.estimated_date', { date: '15 Sep 2026' }) },
  ]

  return (
    <MockPage icon="🏦" title={t('page_payouts.title')} description={t('page_payouts.description')}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {payouts.map((p) => (
          <div key={p.period} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{p.period}</p>
              <p className="text-xs text-gray-500">{p.date}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-brand-600">{formatCurrency(p.amount)}</p>
              <p className="text-xs text-gray-500">{p.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
