import MockPage from '../components/MockPage'
import { formatRupiah } from '../utils/format'

const refunds = [
  { order: 'ORD-SEED-9', customer: 'Dedi Kurniawan', amount: 1755281, type: 'Full', status: 'Diproses' },
  { order: 'ORD-SEED-6', customer: 'Joko Santoso', amount: 422138, type: 'Partial', status: 'Selesai' },
]

export default function Refunds() {
  return (
    <MockPage icon="💸" title="Refunds" description="Transaksi pengembalian dana ke pelanggan.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {refunds.map((r) => (
          <div key={r.order} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{r.order}</p>
              <p className="text-xs text-gray-500">{r.customer} · {r.type}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-brand-600">{formatRupiah(r.amount)}</p>
              <p className="text-xs text-gray-500">{r.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
