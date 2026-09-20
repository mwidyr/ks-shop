import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductPerformance } from '../api/reports'
import { listProducts } from '../api/products'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'
import ProductSearchBox from '../components/ProductSearchBox'

export default function ProductPerformance() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [products, setProducts] = useState([])
  const [sku, setSku] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { listHosts(true).then(setHosts) }, [])
  useEffect(() => { listProducts().then(setProducts) }, [])

  useEffect(() => {
    if (!sku) { setData(null); return }
    setLoading(true)
    setNotFound(false)
    getProductPerformance({ sku, date_from: range.from, date_to: range.to, host_id: hostId })
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => { setData(null); setLoading(false); setNotFound(true) })
  }, [sku, range, hostId])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <ProductSearchBox products={products} sku={sku} onPick={setSku} />
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">{t('page_product_analytics.all_hosts')}</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>

      {!sku ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_product_performance.empty_pick_product')}</div>
      ) : loading || !data ? (
        notFound ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_product_performance.not_found')}</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_performance.product')}</p>
              <p className="text-sm font-bold text-gray-800 truncate">{data.summary.product_name}</p>
              <p className="text-xs text-gray-400 font-mono">{data.summary.sku} · {data.summary.category}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_analytics.total_qty')}</p>
              <p className="text-lg font-bold text-gray-800">{data.summary.qty}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_analytics.total_gmv')}</p>
              <p className="text-lg font-bold text-brand-600">{formatCurrency(data.summary.gmv)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_performance.multi_color_rate')}</p>
              <p className="text-lg font-bold text-gray-800">
                {data.combo.total_orders > 0 ? ((data.combo.multi_color_orders / data.combo.total_orders) * 100).toFixed(1) : '0.0'}%
              </p>
              <p className="text-[11px] text-gray-400">{t('page_product_performance.multi_color_rate_hint', { multi: data.combo.multi_color_orders, total: data.combo.total_orders })}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
              <h2 className="font-bold text-gray-800 mb-4">{t('page_product_performance.by_color_title')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase border-b">
                    <th className="p-2">{t('page_product_analytics.col_color')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.by_color.map((c) => (
                    <tr key={c.color}>
                      <td className="p-2 font-medium text-gray-700">{c.color}</td>
                      <td className="p-2 text-gray-500">{c.qty}</td>
                      <td className="p-2 text-gray-700 font-semibold">{formatCurrency(c.gmv)}</td>
                      <td className="p-2 text-gray-500">{c.gmv_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.by_color.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
              <h2 className="font-bold text-gray-800 mb-4">{t('page_product_performance.by_host_title')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase border-b">
                    <th className="p-2">{t('page_product_analytics.host')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.by_host.map((h, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium text-gray-700">{h.host_name}</td>
                      <td className="p-2 text-gray-500">{h.qty}</td>
                      <td className="p-2 text-gray-700 font-semibold">{formatCurrency(h.gmv)}</td>
                      <td className="p-2 text-gray-500">{h.gmv_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.by_host.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
              <h2 className="font-bold text-gray-800 mb-1">{t('page_product_performance.color_combo_title')}</h2>
              <p className="text-xs text-gray-400 mb-4">{t('page_product_performance.color_combo_hint')}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase border-b">
                    <th className="p-2">{t('page_product_performance.col_colors')}</th><th className="p-2">{t('page_product_performance.col_order_count')}</th><th className="p-2">{t('page_product_performance.col_pct')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.combo.color_combos.map((c, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium text-gray-700">{c.colors}</td>
                      <td className="p-2 text-gray-500">{c.order_count}</td>
                      <td className="p-2 text-gray-500">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.combo.color_combos.length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-gray-400">{t('page_product_performance.no_combo')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
              <h2 className="font-bold text-gray-800 mb-1">{t('page_product_performance.cross_sell_title')}</h2>
              <p className="text-xs text-gray-400 mb-4">{t('page_product_performance.cross_sell_hint')}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase border-b">
                    <th className="p-2">{t('page_product_analytics.col_code')}</th><th className="p-2">{t('page_product_analytics.col_product')}</th><th className="p-2">{t('page_product_performance.col_order_count')}</th><th className="p-2">{t('page_product_performance.col_pct')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.cross_sell.map((c) => (
                    <tr key={c.sku}>
                      <td className="p-2 font-mono text-xs text-brand-600">{c.sku}</td>
                      <td className="p-2 font-medium text-gray-700">{c.product_name}</td>
                      <td className="p-2 text-gray-500">{c.order_count}</td>
                      <td className="p-2 text-gray-500">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.cross_sell.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('page_product_performance.no_combo')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
