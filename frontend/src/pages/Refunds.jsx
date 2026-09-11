import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'
import { formatCurrency } from '../utils/format'

const statusKeys = {
  Diproses: 'processing',
  Selesai: 'completed',
}

const typeKeys = {
  Full: 'full',
  Partial: 'partial',
}

const refunds = [
  { order: 'ORD-SEED-9', customer: 'Dedi Kurniawan', amount: 1755281, type: 'Full', status: 'Diproses' },
  { order: 'ORD-SEED-6', customer: 'Joko Santoso', amount: 422138, type: 'Partial', status: 'Selesai' },
]

export default function Refunds() {
  const { t } = useTranslation()
  return (
    <MockPage icon="💸" title={t('page_refunds.title')} description={t('page_refunds.description')}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {refunds.map((r) => (
          <div key={r.order} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{r.order}</p>
              <p className="text-xs text-gray-500">{r.customer} · {t(`page_refunds.type.${typeKeys[r.type]}`)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-brand-600">{formatCurrency(r.amount)}</p>
              <p className="text-xs text-gray-500">{t(`page_refunds.status.${statusKeys[r.status]}`)}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
