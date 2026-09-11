import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { getProductReport, getOrderReport } from '../api/reports'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'

function SummaryCard({ summary, t }) {
  if (!summary) return null
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
      <p className="text-xs text-gray-400 uppercase">{t('page_reports.net_sales')}</p>
      <p className="text-2xl font-extrabold text-gray-800">{formatCurrency(summary.net_sales)}</p>
      <p className="text-xs text-gray-500">{t('page_reports.summary_orders_line', { count: summary.order_count, avg: formatCurrency(summary.avg_order) })}</p>
    </div>
  )
}

function exportCsv(filename, rows) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const { t } = useTranslation()
  const tabs = [
    { key: 'products', label: t('page_reports.tab_products') },
    { key: 'customers', label: t('page_reports.tab_customers') },
    { key: 'hosts', label: t('page_reports.tab_hosts') },
    { key: 'staff', label: t('page_reports.tab_staff') },
  ]
  const [tab, setTab] = useState('products')
  const [range, setRange] = useState(presetRange(29))
  const [search, setSearch] = useState('')
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { listHosts(true).then(setHosts) }, [])

  useEffect(() => {
    setLoading(true)
    const params = { from: range.from, to: range.to }
    const request = tab === 'products'
      ? getProductReport(params)
      : getOrderReport({ ...params, q: tab === 'customers' ? search : '', host_id: tab === 'hosts' ? hostId : '' })
    request.then((res) => { setData(res); setLoading(false) })
  }, [tab, range, search, hostId])

  function handleExport() {
    if (!data) return
    exportCsv(`laporan-${tab}.csv`, data.items)
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tItem) => (
            <button
              key={tItem.key}
              onClick={() => setTab(tItem.key)}
              className={`text-sm font-medium px-4 py-1.5 rounded-full border ${tab === tItem.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {tItem.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button onClick={handleExport} className="text-sm font-semibold px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
            {t('page_reports.export_csv')}
          </button>
        </div>
      </div>

      {tab === 'customers' && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('page_reports.customer_search_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
        />
      )}
      {tab === 'hosts' && (
        <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
          <option value="">{t('page_reports.all_hosts')}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      )}

      <SummaryCard summary={data?.summary} t={t} />

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_reports.loading_report')}</p>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_reports.no_data_in_range')}</div>
      ) : tab === 'products' ? (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">{t('page_reports.col_product')}</th>
                <th className="p-3">{t('page_reports.col_variant')}</th>
                <th className="p-3 text-right">{t('page_reports.col_order_count')}</th>
                <th className="p-3 text-right">{t('page_reports.col_qty')}</th>
                <th className="p-3 text-right">{t('page_reports.col_returns')}</th>
                <th className="p-3 text-right">{t('page_reports.col_amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{row.name} <span className="font-mono text-xs text-gray-400">{row.sku}</span></td>
                  <td className="p-3 text-gray-500">{row.color}/{row.size}</td>
                  <td className="p-3 text-right">{row.order_count}</td>
                  <td className="p-3 text-right">{row.qty}</td>
                  <td className="p-3 text-right text-red-500">{row.qty_return}</td>
                  <td className="p-3 text-right font-semibold text-brand-600">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">{t('page_reports.col_date')}</th>
                <th className="p-3">{t('page_reports.col_order')}</th>
                <th className="p-3">{t('page_reports.col_status')}</th>
                <th className="p-3">{t('page_reports.col_product')}</th>
                <th className="p-3">{t('page_reports.col_variant')}</th>
                <th className="p-3 text-right">{t('page_reports.col_qty')}</th>
                <th className="p-3 text-right">{t('page_reports.col_amount')}</th>
                {tab !== 'hosts' && <th className="p-3">{t('page_reports.col_customer')}</th>}
                {tab === 'hosts' ? <th className="p-3">{t('page_reports.col_host')}</th> : tab === 'staff' ? <th className="p-3">{t('page_reports.col_staff')}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-3 text-gray-500">{row.date}</td>
                  <td className="p-3 font-medium text-gray-800">{row.order_no}</td>
                  <td className="p-3 text-gray-500">{row.status}</td>
                  <td className="p-3 text-gray-700">{row.product_name}</td>
                  <td className="p-3 text-gray-500">{row.variant}</td>
                  <td className="p-3 text-right">{row.qty}</td>
                  <td className="p-3 text-right font-semibold text-brand-600">{formatCurrency(row.subtotal)}</td>
                  {tab !== 'hosts' && <td className="p-3 text-gray-500">{row.customer_name} · {row.customer_phone}</td>}
                  {tab === 'hosts' ? <td className="p-3 text-gray-500">{row.host_name}</td> : tab === 'staff' ? <td className="p-3 text-gray-500">{row.staff_name}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
