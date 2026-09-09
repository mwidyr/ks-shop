import MockPage from '../components/MockPage'
import { formatRupiah } from '../utils/format'

const payouts = [
  { period: '1-7 Sep 2026', amount: 8450000, status: 'Dibayarkan', date: '8 Sep 2026' },
  { period: '8-14 Sep 2026', amount: 6120000, status: 'Diproses', date: 'Estimasi 15 Sep 2026' },
]

export default function Payouts() {
  return (
    <MockPage icon="🏦" title="Payouts" description="Jadwal dan riwayat pencairan dana ke rekening seller.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {payouts.map((p) => (
          <div key={p.period} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{p.period}</p>
              <p className="text-xs text-gray-500">{p.date}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-brand-600">{formatRupiah(p.amount)}</p>
              <p className="text-xs text-gray-500">{p.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
