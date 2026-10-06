import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductPerformance } from '../api/reports'
import { listProducts } from '../api/products'
import { listHosts } from '../api/hosts'
import { listLocations } from '../api/hostLocations'
import { listAffiliates } from '../api/affiliates'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'
import SalesChannelFilter from '../components/SalesChannelFilter'
import ProductSearchBox from '../components/ProductSearchBox'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses, Metric } from '../components/Table'
import { useMasterData } from '../context/MasterDataContext'

export default function ProductPerformance() {
  const { t } = useTranslation()
  const { translateColor, translateCategory } = useMasterData()
  const [range, setRange] = useState(presetRange(29))
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState([])
  const [channel, setChannel] = useState('all')
  const [affiliateId, setAffiliateId] = useState('')
  const [affiliates, setAffiliates] = useState([])
  const [products, setProducts] = useState([])
  const [sku, setSku] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { listHosts(true).then(setHosts) }, [])
  useEffect(() => { listLocations().then(setLocations) }, [])
  useEffect(() => { listAffiliates().then(setAffiliates) }, [])
  useEffect(() => { listProducts().then(setProducts) }, [])

  useEffect(() => {
    if (!sku) { setData(null); return }
    setLoading(true)
    setNotFound(false)
    getProductPerformance({
      sku, date_from: range.from, date_to: range.to, host_id: channel === 'live' ? hostId : '',
      location_id: channel === 'live' ? locationId : '',
      channel, affiliate_id: channel === 'website' ? affiliateId : '',
    })
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => { setData(null); setLoading(false); setNotFound(true) })
  }, [sku, range, hostId, locationId, channel, affiliateId])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className={`${cardClasses} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <ProductSearchBox products={products} sku={sku} onPick={setSku} />
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <SalesChannelFilter
            channel={channel} onChannelChange={setChannel}
            locationId={locationId} onLocationChange={setLocationId} locations={locations}
            hostId={hostId} onHostChange={setHostId} hosts={hosts}
            affiliateId={affiliateId} onAffiliateChange={setAffiliateId} affiliates={affiliates}
          />
        </div>
      </div>

      {!sku ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('page_product_performance.empty_pick_product')}</div>
      ) : loading || !data ? (
        notFound ? (
          <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('page_product_performance.not_found')}</div>
        ) : (
          <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('common.loading')}</div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.product')}</p>
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{data.summary.product_name}</p>
              <p className="text-xs text-[var(--text-secondary)] font-mono">{data.summary.sku} · {translateCategory(data.summary.category)}</p>
            </div>
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_analytics.total_qty')}</p>
              <Metric type="qty" className="text-lg">{data.summary.qty}</Metric>
            </div>
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_analytics.total_gmv')}</p>
              <Metric type="gmv" className="text-lg">{formatCurrency(data.summary.gmv)}</Metric>
            </div>
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.multi_color_rate')}</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                {data.combo.total_orders > 0 ? ((data.combo.multi_color_orders / data.combo.total_orders) * 100).toFixed(1) : '0.0'}%
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]">{t('page_product_performance.multi_color_rate_hint', { multi: data.combo.multi_color_orders, total: data.combo.total_orders })}</p>
            </div>
          </div>

          <div className={`${cardClasses} p-5`}>
            <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_product_performance.avg_daily_sales_title')}</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">{t('page_product_performance.avg_daily_sales_hint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.today_sales')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.summary.today_sales}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.avg_daily_7d')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.summary.avg_daily_7d.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.avg_daily_14d')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.summary.avg_daily_14d.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.avg_daily_30d')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.summary.avg_daily_30d.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_performance.avg_daily_custom', { days: data.summary.custom_period_days })}</p>
                <p className="text-lg font-bold text-brand-600">{data.summary.avg_daily_custom.toFixed(1)}</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className={`${cardClasses} p-5 overflow-x-auto`}>
              <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_product_performance.by_color_title')}</h2>
              <table className={tableClasses}>
                <thead>
                  <tr className={theadRowClasses}>
                    <th className="p-2">{t('page_product_analytics.col_color')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyClasses}>
                  {data.by_color.map((c) => (
                    <tr key={c.color} className={rowClasses}>
                      <td className="p-2 font-medium text-[var(--text-primary)]">{translateColor(c.color)}</td>
                      <td className="p-2"><Metric type="qty">{c.qty}</Metric></td>
                      <td className="p-2"><Metric type="gmv">{formatCurrency(c.gmv)}</Metric></td>
                      <td className="p-2 text-[var(--text-secondary)]">{c.gmv_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.by_color.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={`${cardClasses} p-5 overflow-x-auto`}>
              <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_product_performance.by_host_title')}</h2>
              <table className={tableClasses}>
                <thead>
                  <tr className={theadRowClasses}>
                    <th className="p-2">{t('page_product_analytics.host')}</th><th className="p-2">{t('page_product_analytics.col_qty')}</th><th className="p-2">{t('page_product_analytics.col_gmv')}</th><th className="p-2">{t('page_product_analytics.col_gmv_pct')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyClasses}>
                  {data.by_host.map((h, i) => (
                    <tr key={i} className={rowClasses}>
                      <td className="p-2 font-medium text-[var(--text-primary)]">{h.host_name}</td>
                      <td className="p-2"><Metric type="qty">{h.qty}</Metric></td>
                      <td className="p-2"><Metric type="gmv">{formatCurrency(h.gmv)}</Metric></td>
                      <td className="p-2 text-[var(--text-secondary)]">{h.gmv_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.by_host.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_analytics.no_sales_in_range')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className={`${cardClasses} p-5 overflow-x-auto`}>
              <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_product_performance.color_combo_title')}</h2>
              <p className="text-xs text-[var(--text-secondary)] mb-4">{t('page_product_performance.color_combo_hint')}</p>
              <table className={tableClasses}>
                <thead>
                  <tr className={theadRowClasses}>
                    <th className="p-2">{t('page_product_performance.col_colors')}</th><th className="p-2">{t('page_product_performance.col_order_count')}</th><th className="p-2">{t('page_product_performance.col_pct')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyClasses}>
                  {data.combo.color_combos.map((c, i) => (
                    <tr key={i} className={rowClasses}>
                      <td className="p-2 font-medium text-[var(--text-primary)]">{c.colors.split(' + ').map(translateColor).join(' + ')}</td>
                      <td className="p-2"><Metric type="ord">{c.order_count}</Metric></td>
                      <td className="p-2 text-[var(--text-secondary)]">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.combo.color_combos.length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_performance.no_combo')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={`${cardClasses} p-5 overflow-x-auto`}>
              <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_product_performance.cross_sell_title')}</h2>
              <p className="text-xs text-[var(--text-secondary)] mb-4">{t('page_product_performance.cross_sell_hint')}</p>
              <table className={tableClasses}>
                <thead>
                  <tr className={theadRowClasses}>
                    <th className="p-2">{t('page_product_analytics.col_code')}</th><th className="p-2">{t('page_product_analytics.col_product')}</th><th className="p-2">{t('page_product_performance.col_order_count')}</th><th className="p-2">{t('page_product_performance.col_pct')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyClasses}>
                  {data.cross_sell.map((c) => (
                    <tr key={c.sku} className={rowClasses}>
                      <td className="p-2 font-mono text-xs text-brand-600">{c.sku}</td>
                      <td className="p-2 font-medium text-[var(--text-primary)]">{c.product_name}</td>
                      <td className="p-2"><Metric type="ord">{c.order_count}</Metric></td>
                      <td className="p-2 text-[var(--text-secondary)]">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {data.cross_sell.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_performance.no_combo')}</td></tr>
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
