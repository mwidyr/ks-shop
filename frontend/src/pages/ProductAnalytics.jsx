import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductAnalysis } from '../api/reports'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'
import { IconChevronDown } from '../components/icons'

// Color breakdown for one ranked product, derived client-side from the already-fetched
// by_variant rows (no extra API call) - grouped by color, with % of that product's OWN qty
// (not % of the whole period), matching "sales by color" rather than the page-wide GMV%.
function colorBreakdownFor(byVariant, productSku, productQty) {
  const rows = byVariant.filter((v) => v.product_sku === productSku)
  const byColor = new Map()
  for (const v of rows) {
    const prev = byColor.get(v.color) || 0
    byColor.set(v.color, prev + v.qty)
  }
  return [...byColor.entries()]
    .map(([color, qty]) => ({ color, qty, pct: productQty > 0 ? (qty / productQty) * 100 : 0 }))
    .sort((a, b) => b.qty - a.qty)
}

export default function ProductAnalytics() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [productSort, setProductSort] = useState('gmv')
  // A Set, not a single value - each ranking row expands/collapses independently instead of
  // acting as an accordion (opening one used to close whichever other row was already open).
  const [expandedSkus, setExpandedSkus] = useState(() => new Set())

  function toggleExpanded(sku) {
    setExpandedSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

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
                {[...data.by_product].sort((a, b) => (productSort === 'qty' ? b.qty - a.qty : b.gmv - a.gmv)).map((p) => {
                  const isExpanded = expandedSkus.has(p.sku)
                  const colors = isExpanded ? colorBreakdownFor(data.by_variant, p.sku, p.qty) : []
                  return (
                    <Fragment key={p.sku}>
                      <tr
                        onClick={() => toggleExpanded(p.sku)}
                        className="cursor-pointer hover:bg-gray-50"
                      >
                        <td className="p-2 font-mono text-xs text-brand-600">
                          <span className="inline-flex items-center gap-1">
                            <IconChevronDown width={12} height={12} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : '-rotate-90'}`} />
                            {p.sku}
                          </span>
                        </td>
                        <td className="p-2 text-gray-500">{p.category}</td>
                        <td className="p-2 font-medium text-gray-700">{p.product_name}</td>
                        <td className="p-2 text-gray-500">{p.qty}</td>
                        <td className="p-2 text-gray-700 font-semibold">{formatCurrency(p.gmv)}</td>
                        <td className="p-2 text-gray-500">{p.gmv_pct.toFixed(1)}%</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0 bg-gray-50">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-gray-400 uppercase border-b border-gray-200">
                                  <th className="py-1.5 pl-8">{t('page_product_analytics.col_color')}</th>
                                  <th className="py-1.5">{t('page_product_analytics.col_qty')}</th>
                                  <th className="py-1.5 pr-4">{t('page_product_analytics.col_qty_pct')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {colors.map((c) => (
                                  <tr key={c.color}>
                                    <td className="py-1.5 pl-8 font-medium text-gray-700">{c.color}</td>
                                    <td className="py-1.5 text-gray-500">{c.qty}</td>
                                    <td className="py-1.5 pr-4 text-gray-500">{c.pct.toFixed(1)}%</td>
                                  </tr>
                                ))}
                                {colors.length === 0 && (
                                  <tr><td colSpan={3} className="py-3 text-center text-gray-400">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
