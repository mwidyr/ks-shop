import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getSummary, getGraph, getHostRanking, getTopProducts, getProfit, getAlerts } from '../api/dashboard'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import { resolveUrl } from '../utils/image'
import { statusLabels } from '../components/StatusPill'
import StatTile from '../components/StatTile'
import BigStatCard from '../components/BigStatCard'
import DateRangePicker from '../components/DateRangePicker'

const seriesColors = ['#2563eb', '#0891b2', '#7c3aed', '#16a34a', '#db2777', '#4338ca']
const avatarColors = ['bg-blue-500', 'bg-cyan-500', 'bg-violet-500', 'bg-green-500', 'bg-pink-500', 'bg-indigo-500']
const medals = ['🥇', '🥈', '🥉']

function buildChartData(points, metric) {
  const days = [...new Set(points.map((p) => p.day))].sort()
  const hosts = [...new Set(points.map((p) => p.host))]
  return days.map((day) => {
    const row = { day }
    hosts.forEach((host) => {
      const point = points.find((p) => p.day === day && p.host === host)
      row[host] = point ? point[metric] : 0
    })
    return row
  })
}

function colorFor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

export default function Dashboard() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState(null)
  const [graphPoints, setGraphPoints] = useState([])
  const [ranking, setRanking] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [activeHostCount, setActiveHostCount] = useState(0)
  const [profit, setProfit] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [range, setRange] = useState(null)
  const [metric, setMetric] = useState('qty')

  useEffect(() => {
    listHosts().then((hosts) => setActiveHostCount(hosts.length))
  }, [])

  useEffect(() => {
    if (!range) return
    getSummary(range).then(setSummary)
    getGraph(range).then(setGraphPoints)
    getHostRanking(range).then(setRanking)
    getTopProducts(range).then(setTopProducts)
    getProfit(range).then(setProfit)
    getAlerts(range).then(setAlerts)
  }, [range])

  const hosts = useMemo(() => [...new Set(graphPoints.map((p) => p.host))], [graphPoints])
  const chartData = useMemo(() => buildChartData(graphPoints, metric), [graphPoints, metric])
  const statusEntries = Object.entries(statusLabels)

  const counts = summary?.order_status_counts || {}
  const revenue = summary?.order_status_revenue || {}
  const totalOrders = Object.values(counts).reduce((a, b) => a + b, 0)
  const lossRevenue = (revenue.cancelled || 0) + (revenue.return || 0)
  const lossCount = (counts.cancelled || 0) + (counts.return || 0)
  const avgOrder = totalOrders > 0 ? (summary?.total_revenue || 0) / totalOrders : 0

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-end mb-6">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!summary ? (
        <p className="text-gray-500 py-10 text-center">{t('page_dashboard.loading_dashboard')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <BigStatCard title={t('page_dashboard.potential_pending')} value={formatCurrency(revenue.pending || 0)} subLabel={t('page_dashboard.order_count', { count: counts.pending || 0 })} iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="🔥" />
            <BigStatCard title={t('page_dashboard.deal_delivered')} value={formatCurrency(revenue.delivered || 0)} subLabel={t('page_dashboard.order_count', { count: counts.delivered || 0 })} iconBg="bg-green-50" iconColor="text-green-600" icon="✅" />
            <BigStatCard title={t('page_dashboard.loss_cancelled_return')} value={formatCurrency(lossRevenue)} subLabel={t('page_dashboard.order_count', { count: lossCount })} iconBg="bg-red-50" iconColor="text-red-600" icon="✕" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatTile label={t('page_dashboard.total_order')} value={totalOrders} colorClass="bg-indigo-50 text-indigo-700" />
            <StatTile label={t('page_dashboard.qty_sold')} value={summary.total_qty} colorClass="bg-cyan-50 text-cyan-700" />
            <StatTile label={t('page_dashboard.avg_order')} value={formatCurrency(avgOrder)} colorClass="bg-purple-50 text-purple-700" />
            <StatTile label={t('page_dashboard.active_hosts')} value={activeHostCount} colorClass="bg-pink-50 text-pink-700" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatTile label={t('page_dashboard.cancelled_rate')} value={`${totalOrders > 0 ? ((counts.cancelled || 0) / totalOrders * 100).toFixed(1) : 0}%`} colorClass="bg-red-50 text-red-700" />
            <StatTile label={t('page_dashboard.return_rate')} value={`${totalOrders > 0 ? ((counts.return || 0) / totalOrders * 100).toFixed(1) : 0}%`} colorClass="bg-orange-50 text-orange-700" />
            <StatTile label={t('page_dashboard.visitors_mock')} value="8.421" colorClass="bg-gray-50 text-gray-500" />
            <StatTile label={t('page_dashboard.conversion_rate_mock')} value="3.21%" colorClass="bg-gray-50 text-gray-500" />
          </div>

          {alerts && (
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-8">
              <h2 className="font-bold text-gray-800 mb-3">🔔 {t('page_dashboard.alerts_title')}</h2>
              <div className="space-y-2 text-sm">
                {alerts.low_stock_count > 0 && (
                  <p className="text-yellow-700">⚠ {t('page_dashboard.alert_low_stock', { count: alerts.low_stock_count })}</p>
                )}
                {alerts.ship_today_count > 0 && (
                  <p className="text-yellow-700">⚠ {t('page_dashboard.alert_ship_today', { count: alerts.ship_today_count })}</p>
                )}
                <p className="text-yellow-700">⚠ {t('page_dashboard.alert_unread_chat_mock')}</p>
                {alerts.declining_products.length > 0 && (
                  <p className="text-yellow-700">⚠ {t('page_dashboard.alert_declining_products', { count: alerts.declining_products.length, names: alerts.declining_products.join(', ') })}</p>
                )}
                <p className="text-green-700">✓ {t('page_dashboard.alert_completed_orders', { count: alerts.completed_count })}</p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-bold text-gray-800">{t('page_dashboard.sales_chart_title')}</h2>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setMetric('qty')}
                      className={`text-xs font-semibold px-3 py-1 rounded-md ${metric === 'qty' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                    >
                      {t('page_dashboard.qty_sold')}
                    </button>
                    <button
                      onClick={() => setMetric('revenue')}
                      className={`text-xs font-semibold px-3 py-1 rounded-md ${metric === 'revenue' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                    >
                      {t('page_dashboard.metric_revenue')}
                    </button>
                  </div>
                </div>
                {chartData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">{t('page_dashboard.no_sales_data')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        {hosts.map((host, i) => (
                          <linearGradient key={host} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={seriesColors[i % seriesColors.length]} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={seriesColors[i % seriesColors.length]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => (metric === 'revenue' ? formatCurrency(v) : v)} />
                      <Legend />
                      {hosts.map((host, i) => (
                        <Area
                          key={host}
                          type="monotone"
                          dataKey={host}
                          stroke={seriesColors[i % seriesColors.length]}
                          strokeWidth={2}
                          fill={`url(#grad-${i})`}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-4">{t('page_dashboard.order_per_status')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {statusEntries.map(([key, label]) => (
                    <div key={key} className="border border-gray-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-extrabold text-brand-600">{counts[key] || 0}</p>
                      <p className="text-xs text-gray-500 mt-1">{t(`status.${key}`, label)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {profit && (
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h2 className="font-bold text-gray-800 mb-4">{t('page_dashboard.gross_to_net_profit')}</h2>
                  <div className="text-sm divide-y">
                    {[
                      [t('page_dashboard.profit_gross_sales'), profit.gross_sales, false],
                      [t('page_dashboard.profit_discount'), profit.discount, true],
                      [t('page_dashboard.profit_platform_fee'), profit.platform_fee, true],
                      [t('page_dashboard.profit_shipping_subsidy'), profit.shipping_subsidy, true],
                      [t('page_dashboard.profit_ads'), profit.ad_cost, true],
                      [t('page_dashboard.profit_refund'), profit.refund, true],
                      [t('page_dashboard.profit_net_sales'), profit.net_sales, false],
                    ].map(([label, value, neg]) => (
                      <div key={label} className="flex items-center justify-between py-1.5">
                        <span className="text-gray-500">{label}</span>
                        <span className={neg ? 'text-red-600' : 'text-gray-700 font-medium'}>
                          {neg && value > 0 ? '-' : ''}{formatCurrency(value)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 pt-3">
                      <span className="font-bold text-gray-800">{t('page_dashboard.profit_label')}</span>
                      <span className="text-lg font-extrabold text-brand-600">{formatCurrency(profit.net_profit)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🏆 {t('page_dashboard.host_ranking_title')}</h2>
                {ranking.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">{t('page_dashboard.no_data')}</p>
                ) : (
                  <div className="space-y-3">
                    {[...ranking].sort((a, b) => b[metric] - a[metric]).map((row, i) => (
                      <div key={row.host_id} className="flex items-center gap-3">
                        <span className="w-5 text-sm text-gray-400">{medals[i] || i + 1}</span>
                        <div className={`w-8 h-8 rounded-full ${colorFor(row.host)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                          {row.host.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{row.host}</p>
                          <p className="text-xs text-gray-400">{t('page_dashboard.pax_count', { qty: row.qty })}</p>
                        </div>
                        <span className="text-sm font-semibold text-brand-600 shrink-0">{formatCurrency(row.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-4">{t('page_dashboard.top_product_title')}</h2>
                {topProducts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">{t('page_dashboard.no_data')}</p>
                ) : (
                  <div className="space-y-3">
                    {topProducts.map((p) => (
                      <div key={p.product_id} className="flex items-center gap-3">
                        <img src={resolveUrl(p.image_url)} className="w-8 h-8 rounded-lg object-cover bg-gray-100 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{t('page_dashboard.qty_sold_count', { qty: p.qty })}</p>
                        </div>
                        <span className="text-sm font-semibold text-brand-600 shrink-0">{formatCurrency(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
