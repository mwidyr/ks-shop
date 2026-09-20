import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductColorPair } from '../api/reports'
import { listProducts } from '../api/products'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'
import ProductSearchBox from '../components/ProductSearchBox'

// Cross-product color pair analysis: pick two products, see which color combinations across
// both of them were bought together in the same order. A two-product extension of
// ProductPerformance's single-product "Color Combo" - lives on its own page rather than as a
// section there because the state model (two selected products, not one) doesn't fit that
// page's single-SKU drill-down shape.
export default function ProductColorPair() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [products, setProducts] = useState([])
  const [skuA, setSkuA] = useState('')
  const [skuB, setSkuB] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { listProducts().then(setProducts) }, [])

  const sameProduct = Boolean(skuA) && skuA === skuB

  useEffect(() => {
    if (!skuA || !skuB || sameProduct) { setData(null); return }
    setLoading(true)
    getProductColorPair({ sku_a: skuA, sku_b: skuB, date_from: range.from, date_to: range.to })
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => { setData(null); setLoading(false) })
  }, [skuA, skuB, range, sameProduct])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ProductSearchBox products={products} sku={skuA} onPick={setSkuA} placeholder={t('page_product_color_pair.pick_product_a')} />
          <span className="text-gray-400 text-sm">×</span>
          <ProductSearchBox products={products} sku={skuB} onPick={setSkuB} placeholder={t('page_product_color_pair.pick_product_b')} />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {sameProduct ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_product_color_pair.same_product_warning')}</div>
      ) : !skuA || !skuB ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_product_color_pair.empty_pick_products')}</div>
      ) : loading || !data ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_color_pair.product_a')}</p>
              <p className="text-sm font-bold text-gray-800 truncate">{data.product_a.name}</p>
              <p className="text-xs text-gray-400 font-mono">{data.product_a.sku}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_color_pair.product_b')}</p>
              <p className="text-sm font-bold text-gray-800 truncate">{data.product_b.name}</p>
              <p className="text-xs text-gray-400 font-mono">{data.product_b.sku}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_product_color_pair.shared_orders')}</p>
              <p className="text-lg font-bold text-brand-600">{data.total_orders}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-1">{t('page_product_color_pair.title')}</h2>
            <p className="text-xs text-gray-400 mb-4">{t('page_product_color_pair.hint')}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">{t('page_product_color_pair.col_color_a')}</th>
                  <th className="p-2">{t('page_product_color_pair.col_color_b')}</th>
                  <th className="p-2">{t('page_product_performance.col_order_count')}</th>
                  <th className="p-2">{t('page_product_performance.col_pct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.pairs.map((p, i) => (
                  <tr key={i}>
                    <td className="p-2 font-medium text-gray-700">{p.color_a}</td>
                    <td className="p-2 font-medium text-gray-700">{p.color_b}</td>
                    <td className="p-2 text-gray-500">{p.order_count}</td>
                    <td className="p-2 text-gray-500">{p.pct.toFixed(1)}%</td>
                  </tr>
                ))}
                {data.pairs.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('page_product_performance.no_combo')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
