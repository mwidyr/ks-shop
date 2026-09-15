import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHostCategoryLeaderboard } from '../api/reports'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'

function CategoryCard({ category }) {
  const { t } = useTranslation()
  const top = category.hosts[0]?.qty || 0
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-bold text-gray-800 mb-3">{category.category}</h2>
      <div className="space-y-1.5">
        {category.hosts.map((h, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`text-xs font-bold w-5 shrink-0 ${i === 0 ? 'text-brand-600' : 'text-gray-400'}`}>{i + 1}</span>
            <span className="text-sm text-gray-700 flex-1 truncate">{h.host_name}</span>
            <div className="flex items-center gap-2 w-28 shrink-0">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-brand-500" style={{ width: `${top > 0 ? (h.qty / top) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-600 w-8 text-right">{h.qty}</span>
            </div>
          </div>
        ))}
        {category.hosts.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">{t('page_host_category_leaderboard.no_data')}</p>
        )}
      </div>
    </div>
  )
}

export default function HostCategoryLeaderboard() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getHostCategoryLeaderboard({ date_from: range.from, date_to: range.to }).then((res) => {
      setData(res)
      setLoading(false)
    })
  }, [range])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{t('page_host_category_leaderboard.subtitle')}</p>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loading || !data ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : data.categories.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.categories.map((c) => <CategoryCard key={c.category} category={c} />)}
        </div>
      )}
    </div>
  )
}
