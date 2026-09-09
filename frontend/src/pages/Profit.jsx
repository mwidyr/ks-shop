import { useEffect, useState } from 'react'
import { getProfit } from '../api/dashboard'
import { formatRupiah } from '../utils/format'
import DateRangePicker from '../components/DateRangePicker'

function Row({ label, value, isNegative, bold, indent }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? 'border-t mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-600'} ${indent ? 'pl-4' : ''}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-extrabold text-lg' : 'font-semibold'} ${isNegative ? 'text-red-600' : bold ? 'text-brand-600' : 'text-gray-700'}`}>
        {isNegative && value > 0 ? '-' : ''}{formatRupiah(value)}
      </span>
    </div>
  )
}

export default function Profit() {
  const [range, setRange] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!range) return
    getProfit(range).then(setData)
  }, [range])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-end mb-6">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!data ? (
        <p className="text-gray-500 py-10 text-center">Memuat profit analytics...</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-800 mb-4">Profit Waterfall</h2>
            <Row label="Selling Price (Gross Sales)" value={data.gross_sales} />
            <Row label="Diskon" value={data.discount} isNegative />
            <Row label="Platform Fee" value={data.platform_fee} isNegative />
            <Row label="Payment Fee" value={data.payment_fee} isNegative />
            <Row label="Shipping Subsidy" value={data.shipping_subsidy} isNegative />
            <Row label="Ad Cost" value={data.ad_cost} isNegative />
            <Row label="Refund" value={data.refund} isNegative />
            <Row label="Product Cost (COGS)" value={data.cogs} isNegative />
            <Row label="Net Profit" value={data.net_profit} bold />
            <p className="text-xs text-gray-400 mt-3">
              Platform fee, payment fee, shipping subsidy, dan ad cost dihitung dari asumsi biaya
              di Pengaturan (bukan integrasi payment/ads yang sesungguhnya).
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Profit Margin</p>
              <p className="text-4xl font-extrabold text-brand-600">{data.margin_pct.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-1">dari Gross Sales</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Net Sales</p>
              <p className="text-2xl font-extrabold text-gray-800">{formatRupiah(data.net_sales)}</p>
              <p className="text-xs text-gray-400 mt-1">Gross Sales - Diskon + Biaya Tambahan</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
