import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProfit } from '../api/dashboard'
import { formatCurrency } from '../utils/format'
import DateRangePicker from '../components/DateRangePicker'

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
        <div className="grid sm:grid-cols-3 gap-6">
            {/* #135: gross profit and margin are no longer shown - purchasing costs are in RMB with no
                TWD conversion, so they can't be compared with TWD sales. Sales figures stay. */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-2">{t('page_profit.net_sales')}</p>
              <p className="text-2xl font-extrabold text-gray-800">{formatCurrency(data.net_sales)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('page_profit.net_sales_formula')}</p>
            </div>
        </div>
      )}
    </div>
  )
}
