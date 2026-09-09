import { formatRupiah } from '../utils/format'

const stages = ['Diajukan', 'Ditinjau', 'Disetujui', 'Barang Diterima', 'Inspeksi', 'Refund']

const reasonLabels = {
  damaged: 'Barang rusak', wrong_item: 'Salah barang', missing_item: 'Barang tidak lengkap',
  defective: 'Cacat produksi', change_of_mind: 'Berubah pikiran',
}

const returns = [
  { id: 'RET-001', order: 'ORD-SEED-9', customer: 'Dedi Kurniawan', reason: 'damaged', stage: 1, amount: 1755281, refundType: 'Full' },
  { id: 'RET-002', order: 'ORD-SEED-6', customer: 'Joko Santoso', reason: 'wrong_item', stage: 3, amount: 844276, refundType: 'Replacement' },
  { id: 'RET-003', order: 'ORD-SEED-16', customer: 'Joko Santoso', reason: 'change_of_mind', stage: 5, amount: 649746, refundType: 'Store Credit' },
]

export default function Returns() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      <div className="space-y-4">
        {returns.map((ret) => (
          <div key={ret.id} className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-800">{ret.id} · {ret.order}</p>
                <p className="text-xs text-gray-500">{ret.customer} · Alasan: {reasonLabels[ret.reason]}</p>
              </div>
              <p className="font-semibold text-brand-600">{formatRupiah(ret.amount)}</p>
            </div>
            <div className="flex items-center gap-1 mb-3">
              {stages.map((s, i) => (
                <div key={s} className="flex-1 flex items-center">
                  <div className={`flex-1 text-center text-[10px] font-semibold py-1.5 rounded-full ${
                    i < ret.stage ? 'bg-brand-600 text-white' : i === ret.stage - 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {s}
                  </div>
                  {i < stages.length - 1 && <div className={`w-2 h-0.5 shrink-0 ${i < ret.stage - 1 ? 'bg-brand-600' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Jenis Refund:</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{ret.refundType}</span>
              <div className="ml-auto flex gap-2">
                <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100">Setujui</button>
                <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">Tolak</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
