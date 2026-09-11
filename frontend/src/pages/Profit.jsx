import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProfit } from '../api/dashboard'
import { formatCurrency } from '../utils/format'
import DateRangePicker from '../components/DateRangePicker'

function Row({ label, value, isNegative, bold, indent }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? 'border-t mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-600'} ${indent ? 'pl-4' : ''}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-extrabold text-lg' : 'font-semibold'} ${isNegative ? 'text-red-600' : bold ? 'text-brand-600' : 'text-gray-700'}`}>
        {isNegative && value > 0 ? '-' : ''}{formatCurrency(value)}
      </span>
    </div>
  )
}

export default function Profit() {
  const { t } = useTranslation()
  const [range, setRange] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!range) return
    getProfit(range).then(setData)
  }, [range])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-end mb-6">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!data ? (
        <p className="text-gray-500 py-10 text-center">{t('page_profit.loading')}</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_profit.waterfall_title')}</h2>
            <Row label={t('page_profit.selling_price')} value={data.gross_sales} />
            <Row label={t('page_profit.discount')} value={data.discount} isNegative />
            <Row label={t('page_profit.platform_fee')} value={data.platform_fee} isNegative />
            <Row label={t('page_profit.payment_fee')} value={data.payment_fee} isNegative />
            <Row label={t('page_profit.shipping_subsidy')} value={data.shipping_subsidy} isNegative />
            <Row label={t('page_profit.ad_cost')} value={data.ad_cost} isNegative />
            <Row label={t('page_profit.refund')} value={data.refund} isNegative />
            <Row label={t('page_profit.cogs')} value={data.cogs} isNegative />
            <Row label={t('page_profit.net_profit')} value={data.net_profit} bold />
            <p className="text-xs text-gray-400 mt-3">
              {t('page_profit.assumption_note')}
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">{t('page_profit.profit_margin')}</p>
              <p className="text-4xl font-extrabold text-brand-600">{data.margin_pct.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-1">{t('page_profit.of_gross_sales')}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-2">{t('page_profit.net_sales')}</p>
              <p className="text-2xl font-extrabold text-gray-800">{formatCurrency(data.net_sales)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('page_profit.net_sales_formula')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
