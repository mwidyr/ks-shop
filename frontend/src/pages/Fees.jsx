import { useEffect, useState } from 'react'
import { getFeeSettings } from '../api/settings'

export default function Fees() {
  const [fees, setFees] = useState(null)

  useEffect(() => { getFeeSettings().then(setFees) }, [])

  const rows = fees ? [
    { label: 'Platform Fee', value: `${fees.platform_fee_pct}%` },
    { label: 'Payment Fee', value: `${fees.payment_fee_pct}%` },
    { label: 'Shipping Subsidy', value: `Rp ${fees.shipping_subsidy_flat.toLocaleString('id-ID')} / order` },
    { label: 'Ad Cost', value: `Rp ${fees.ad_cost_flat.toLocaleString('id-ID')} / order` },
  ] : []

  return (
    <div className="px-4 sm:px-6 py-6">
      <p className="text-sm text-gray-500 mb-4">
        Nilai ini dipakai untuk menghitung Profit Analytics. Untuk mengubah, buka
        <span className="font-semibold text-gray-700"> Pengaturan &gt; Asumsi Biaya</span>.
      </p>
      {!fees ? (
        <p className="text-gray-500 py-10 text-center">Memuat...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y max-w-md">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between p-4">
              <span className="text-sm text-gray-600">{r.label}</span>
              <span className="text-sm font-semibold text-gray-800">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
