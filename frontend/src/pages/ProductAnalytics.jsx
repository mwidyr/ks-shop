const rows = [
  { name: 'Gundam RX-78', views: 3210, addToCart: 412, purchases: 120, conversion: '3.7%', trend: '↑ 12%' },
  { name: 'Keyboard Mechanical', views: 1980, addToCart: 210, purchases: 89, conversion: '4.5%', trend: '↓ 4%' },
  { name: 'Mousepad XL', views: 890, addToCart: 95, purchases: 45, conversion: '5.1%', trend: '↑ 8%' },
]

export default function ProductAnalytics() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-4">Product Analytics</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">Produk</th><th className="p-2">Views</th><th className="p-2">Add to Cart</th>
              <th className="p-2">Purchases</th><th className="p-2">Conversion</th><th className="p-2">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="p-2 font-medium text-gray-700">{r.name}</td>
                <td className="p-2 text-gray-500">{r.views.toLocaleString('id-ID')}</td>
                <td className="p-2 text-gray-500">{r.addToCart}</td>
                <td className="p-2 text-gray-500">{r.purchases}</td>
                <td className="p-2 text-gray-500">{r.conversion}</td>
                <td className={`p-2 font-semibold ${r.trend.startsWith('↑') ? 'text-green-600' : 'text-red-600'}`}>{r.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
