import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/format'

const productPerf = [
  { name: 'Sneakers Classic White', revenue: 2848320, orders: 6, units: 12, conversion: '4.1%', profit: 512300 },
  { name: 'Running Shoes Pro', revenue: 2866234, orders: 5, units: 10, conversion: '3.8%', profit: 498100 },
  { name: 'Kaos Polos Premium', revenue: 2376754, orders: 8, units: 18, conversion: '5.2%', profit: 610200 },
]

export default function SalesAnalyticsDetail() {
  const { t } = useTranslation()

  const customerBreakdown = [
    { label: t('page_sales_analytics.new_customer'), value: '32%' },
    { label: t('page_sales_analytics.returning_customer'), value: '48%' },
    { label: t('page_sales_analytics.retention_rate'), value: '61%' },
    { label: t('page_sales_analytics.ltv'), value: formatCurrency(4250000) },
    { label: t('page_sales_analytics.aov'), value: formatCurrency(385000) },
  ]
  const timeBreakdown = [
    { label: t('page_sales_analytics.busiest_hour'), value: '19:00 - 21:00' },
    { label: t('page_sales_analytics.busiest_day'), value: t('page_sales_analytics.friday') },
    { label: t('page_sales_analytics.top_month'), value: t('page_sales_analytics.august') },
  ]

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        {t('shared.mock_preview_badge')}
      </span>

      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-4">{t('page_sales_analytics.product_performance')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">{t('page_sales_analytics.col_product')}</th><th className="p-2">{t('page_sales_analytics.col_revenue')}</th><th className="p-2">{t('page_sales_analytics.col_orders')}</th>
              <th className="p-2">{t('page_sales_analytics.col_units')}</th><th className="p-2">{t('page_sales_analytics.col_conversion')}</th><th className="p-2">{t('page_sales_analytics.col_profit')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {productPerf.map((p) => (
              <tr key={p.name}>
                <td className="p-2 font-medium text-gray-700">{p.name}</td>
                <td className="p-2 text-brand-600 font-semibold">{formatCurrency(p.revenue)}</td>
                <td className="p-2 text-gray-500">{p.orders}</td>
                <td className="p-2 text-gray-500">{p.units}</td>
                <td className="p-2 text-gray-500">{p.conversion}</td>
                <td className="p-2 text-green-600 font-semibold">{formatCurrency(p.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-4">{t('page_sales_analytics.customer')}</h2>
          <div className="space-y-2">
            {customerBreakdown.map((c) => (
              <div key={c.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{c.label}</span>
                <span className="font-semibold text-gray-800">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-4">{t('page_sales_analytics.time')}</h2>
          <div className="space-y-2">
            {timeBreakdown.map((t2) => (
              <div key={t2.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{t2.label}</span>
                <span className="font-semibold text-gray-800">{t2.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
