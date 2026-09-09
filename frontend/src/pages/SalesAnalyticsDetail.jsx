const productPerf = [
  { name: 'Sneakers Classic White', revenue: 2848320, orders: 6, units: 12, conversion: '4.1%', profit: 512300 },
  { name: 'Running Shoes Pro', revenue: 2866234, orders: 5, units: 10, conversion: '3.8%', profit: 498100 },
  { name: 'Kaos Polos Premium', revenue: 2376754, orders: 8, units: 18, conversion: '5.2%', profit: 610200 },
]
const customerBreakdown = [
  { label: 'New Customer', value: '32%' },
  { label: 'Returning Customer', value: '48%' },
  { label: 'Retention Rate', value: '61%' },
  { label: 'LTV', value: 'Rp 4.250.000' },
  { label: 'AOV', value: 'Rp 385.000' },
]
const timeBreakdown = [
  { label: 'Jam Tersibuk', value: '19:00 - 21:00' },
  { label: 'Hari Tersibuk', value: 'Jumat' },
  { label: 'Bulan Tertinggi', value: 'Agustus' },
]

export default function SalesAnalyticsDetail() {
  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>

      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-4">Product Performance</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">Produk</th><th className="p-2">Revenue</th><th className="p-2">Orders</th>
              <th className="p-2">Units</th><th className="p-2">Conversion</th><th className="p-2">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {productPerf.map((p) => (
              <tr key={p.name}>
                <td className="p-2 font-medium text-gray-700">{p.name}</td>
                <td className="p-2 text-brand-600 font-semibold">Rp {p.revenue.toLocaleString('id-ID')}</td>
                <td className="p-2 text-gray-500">{p.orders}</td>
                <td className="p-2 text-gray-500">{p.units}</td>
                <td className="p-2 text-gray-500">{p.conversion}</td>
                <td className="p-2 text-green-600 font-semibold">Rp {p.profit.toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-4">Customer</h2>
          <div className="space-y-2">
            {customerBreakdown.map((c) => (
              <div key={c.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{c.label}</span>
                <span className="font-semibold text-gray-800">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-4">Time</h2>
          <div className="space-y-2">
            {timeBreakdown.map((t) => (
              <div key={t.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{t.label}</span>
                <span className="font-semibold text-gray-800">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
