import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductAnalysis } from '../api/reports'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'

export default function ProductAnalytics() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [productSort, setProductSort] = useState('gmv')

  useEffect(() => { listHosts(true).then(setHosts) }, [])

  useEffect(() => {
    setLoading(true)
    getProductAnalysis({ date_from: range.from, date_to: range.to, host_id: hostId }).then((res) => {
      setData(res)
      setLoading(false)
    })
  }, [range, hostId])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_product_analytics.all_hosts')}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_analytics.host')}</p>
              <p className="text-lg font-bold text-gray-800">{data.summary.host_name || t('page_product_analytics.all_hosts')}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_analytics.total_qty')}</p>
              <p className="text-lg font-bold text-gray-800">{data.summary.qty}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_analytics.total_gmv')}</p>
              <p className="text-lg font-bold text-brand-600">{formatCurrency(data.summary.gmv)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_product_analytics.sales_by_category_title')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_product_analytics.col_category')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.by_category.map((c) => (
                  <tr key={c.category}>
                    <td className="p-2 font-medium text-gray-700">{c.category}</td>
                    <td className="p-2 text-gray-500">{c.qty}</td>
                    <td className="p-2 text-gray-700 font-semibold">{formatCurrency(c.gmv)}</td>
                    <td className="p-2 text-gray-500">{c.gmv_pct.toFixed(1)}%</td>
                  </tr>
                ))}
                {data.by_category.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">{t('page_product_analytics.product_ranking_title')}</h2>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => setProductSort('gmv')}
                  className={`px-3 py-1 rounded-full font-semibold ${productSort === 'gmv' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {t('page_product_analytics.sort_by_gmv')}
                </button>
                <button
                  onClick={() => setProductSort('qty')}
                  className={`px-3 py-1 rounded-full font-semibold ${productSort === 'qty' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {t('page_product_analytics.sort_by_qty')}
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_product_analytics.col_code')}</th><th className="p-2">{t('page_product_analytics.col_category')}</th><th className="p-2">{t('page_product_analytics.col_product')}</th>
                  <th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...data.by_product].sort((a, b) => (productSort === 'qty' ? b.qty - a.qty : b.gmv - a.gmv)).map((p) => (
                  <tr key={p.sku}>
                    <td className="p-2 font-mono text-xs text-brand-600">{p.sku}</td>
                    <td className="p-2 text-gray-500">{p.category}</td>
                    <td className="p-2 font-medium text-gray-700">{p.product_name}</td>
                    <td className="p-2 text-gray-500">{p.qty}</td>
                    <td className="p-2 text-gray-700 font-semibold">{formatCurrency(p.gmv)}</td>
                    <td className="p-2 text-gray-500">{p.gmv_pct.toFixed(1)}%</td>
                  </tr>
                ))}
                {data.by_product.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">{t('page_product_analytics.sales_by_variant_title')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_product_analytics.col_code')}</th><th className="p-2">{t('page_product_analytics.col_category')}</th><th className="p-2">{t('page_product_analytics.col_product')}</th>
                  <th className="p-2">{t('page_product_analytics.col_color')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.by_variant.map((v) => (
                  <tr key={v.sku}>
                    <td className="p-2 font-mono text-xs text-brand-600">{v.sku}</td>
                    <td className="p-2 text-gray-500">{v.category}</td>
                    <td className="p-2 font-medium text-gray-700">{v.product_name}</td>
                    <td className="p-2 text-gray-500">{v.color}</td>
                    <td className="p-2 text-gray-500">{v.qty}</td>
                    <td className="p-2 text-gray-700 font-semibold">{formatCurrency(v.gmv)}</td>
                    <td className="p-2 text-gray-500">{v.gmv_pct.toFixed(1)}%</td>
                  </tr>
                ))}
                {data.by_variant.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
