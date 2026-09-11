import { useEffect, useState } from 'react'
import { getProductAnalysis } from '../api/reports'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import DateRangePicker, { presetRange } from '../components/DateRangePicker'

export default function ProductAnalytics() {
  const [range, setRange] = useState(presetRange(29))
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

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
          <option value="">Semua Host</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">Memuat...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">Host</p>
              <p className="text-lg font-bold text-gray-800">{data.summary.host_name || 'Semua Host'}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">Total QTY</p>
              <p className="text-lg font-bold text-gray-800">{data.summary.qty}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[11px] uppercase text-gray-400 mb-1">Total GMV</p>
              <p className="text-lg font-bold text-brand-600">{formatCurrency(data.summary.gmv)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">Analisis Penjualan per Kategori</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">Kategori</th><th className="p-2">QTY</th><th className="p-2">GMV</th><th className="p-2">GMV%</th>
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
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">Tidak ada penjualan pada rentang ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
            <h2 className="font-bold text-gray-800 mb-4">Analisis Sales Varian Produk</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-2">Kode</th><th className="p-2">Kategori</th><th className="p-2">Produk</th>
                  <th className="p-2">Warna</th><th className="p-2">QTY</th><th className="p-2">GMV</th><th className="p-2">GMV%</th>
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
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">Tidak ada penjualan pada rentang ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
