import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFeeSettings } from '../api/settings'
import { formatCurrency } from '../utils/format'

export default function Fees() {
  const { t } = useTranslation()
  const [fees, setFees] = useState(null)

  useEffect(() => { getFeeSettings().then(setFees) }, [])

  const rows = fees ? [
    { label: t('page_fees.platform_fee'), value: `${fees.platform_fee_pct}%` },
    { label: t('page_fees.payment_fee'), value: `${fees.payment_fee_pct}%` },
    { label: t('page_fees.shipping_subsidy'), value: t('page_fees.per_order_value', { value: formatCurrency(fees.shipping_subsidy_flat) }) },
    { label: t('page_fees.ad_cost'), value: t('page_fees.per_order_value', { value: formatCurrency(fees.ad_cost_flat) }) },
  ] : []

  return (
    <div className="px-4 sm:px-6 py-6">
      <p className="text-sm text-gray-500 mb-4">
        {t('page_fees.intro_line')}
        <span className="font-semibold text-gray-700"> {t('page_fees.settings_path')}</span>.
      </p>
      {!fees ? (
        <p className="text-gray-500 py-10 text-center">{t('common.loading')}</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y max-w-md">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between p-4">
              <span className="text-sm text-gray-600">{r.label}</span>
              <span className="text-sm font-semibold text-gray-800">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
