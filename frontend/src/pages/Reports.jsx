import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { getProductReport, getOrderReport } from '../api/reports'
import { listHosts } from '../api/hosts'
import { formatRupiah } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'

const tabs = [
  { key: 'products', label: 'Produk' },
  { key: 'customers', label: 'Pelanggan' },
  { key: 'hosts', label: 'Host' },
  { key: 'staff', label: 'Staf' },
]

function SummaryCard({ summary }) {
  if (!summary) return null
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
      <p className="text-xs text-gray-400 uppercase">Penjualan Bersih</p>
      <p className="text-2xl font-extrabold text-gray-800">{formatRupiah(summary.net_sales)}</p>
      <p className="text-xs text-gray-500">{summary.order_count} pesanan · rata-rata {formatRupiah(summary.avg_order)}</p>
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
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-4 py-1.5 rounded-full border ${tab === t.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button onClick={handleExport} className="text-sm font-semibold px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
            ⬇ Ekspor CSV
          </button>
        </div>
      </div>

      {tab === 'customers' && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau telepon pelanggan..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
        />
      )}
      {tab === 'hosts' && (
        <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
          <option value="">Semua Host</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      )}

      <SummaryCard summary={data?.summary} />

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat laporan...</p>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">Tidak ada data pada rentang ini.</div>
      ) : tab === 'products' ? (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">Produk</th>
                <th className="p-3">Varian</th>
                <th className="p-3 text-right">Jml Pesanan</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">Retur</th>
                <th className="p-3 text-right">Jumlah</th>
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
                  <td className="p-3 text-right font-semibold text-brand-600">{formatRupiah(row.revenue)}</td>
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
                <th className="p-3">Tanggal</th>
                <th className="p-3">Pesanan</th>
                <th className="p-3">Status</th>
                <th className="p-3">Produk</th>
                <th className="p-3">Varian</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">Jumlah</th>
                {tab !== 'hosts' && <th className="p-3">Pelanggan</th>}
                {tab === 'hosts' ? <th className="p-3">Host</th> : tab === 'staff' ? <th className="p-3">Staf</th> : null}
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
                  <td className="p-3 text-right font-semibold text-brand-600">{formatRupiah(row.subtotal)}</td>
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
