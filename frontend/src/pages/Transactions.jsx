import MockPage from '../components/MockPage'
import { formatRupiah } from '../utils/format'

const rows = [
  { id: 'TRX-2026-091', type: 'Pembayaran Order', amount: 949440, status: 'Berhasil' },
  { id: 'TRX-2026-092', type: 'Refund', amount: -422138, status: 'Berhasil' },
  { id: 'TRX-2026-093', type: 'Pembayaran Order', amount: 1242419, status: 'Pending' },
]

export default function Transactions() {
  return (
    <MockPage icon="💳" title="Transactions" description="Riwayat semua transaksi pembayaran & refund.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{t.id}</p>
              <p className="text-xs text-gray-500">{t.type}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatRupiah(t.amount)}</p>
              <p className="text-xs text-gray-500">{t.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPage>
  )
}
