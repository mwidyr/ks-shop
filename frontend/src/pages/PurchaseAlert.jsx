import { useEffect, useState } from 'react'
import { listPurchaseAlert } from '../api/purchases'

const periods = [
  { value: 7, label: '7 Hari' },
  { value: 14, label: '14 Hari' },
  { value: 30, label: '30 Hari' },
]

export default function PurchaseAlert() {
  const [days, setDays] = useState(30)
  const [atRiskOnly, setAtRiskOnly] = useState(true)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    listPurchaseAlert(days, atRiskOnly).then((res) => {
      setRows(res)
      setLoading(false)
    })
  }

  useEffect(reload, [days, atRiskOnly])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border ${days === p.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={atRiskOnly} onChange={(e) => setAtRiskOnly(e.target.checked)} />
          Hanya tampilkan yang berisiko habis (≤7 hari)
        </label>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">Produk</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Stok Tersedia</th>
              <th className="p-3">Rata-rata Terjual/Hari</th>
              <th className="p-3">Estimasi Habis</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400">
                {atRiskOnly ? 'Tidak ada produk yang berisiko habis stok.' : 'Belum ada data penjualan pada periode ini.'}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.variant_id} className={r.estimated_days_left != null && r.estimated_days_left <= 7 ? 'bg-red-50/50' : ''}>
                <td className="p-3 font-medium text-gray-800">{r.product_name}</td>
                <td className="p-3 font-mono text-xs text-gray-600">{r.sku} · {r.color}/{r.size}</td>
                <td className="p-3 text-gray-600">{r.available_stock}</td>
                <td className="p-3 text-gray-600">{r.avg_daily_qty.toFixed(2)}</td>
                <td className="p-3">
                  {r.estimated_days_left != null ? (
                    <span className={`font-semibold ${r.estimated_days_left <= 7 ? 'text-red-600' : 'text-gray-700'}`}>
                      {Math.floor(r.estimated_days_left)} hari lagi
                    </span>
                  ) : (
                    <span className="text-gray-400">Belum ada penjualan</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
