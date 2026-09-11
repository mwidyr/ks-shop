import { useEffect, useState } from 'react'
import { listActivityLog } from '../api/activityLog'

const actionLabels = {
  'status: -> pending': 'Order dibuat',
  price_changed: 'Ubah harga',
  fee_changed: 'Ubah ongkir',
  label_added: 'Tambah label pelanggan',
  label_removed: 'Hapus label pelanggan',
  role_changed: 'Ubah role',
  active_changed: 'Ubah status aktif',
}

function actionLabel(action) {
  if (actionLabels[action]) return actionLabels[action]
  if (action.startsWith('status:')) return 'Ubah status pesanan: ' + action.replace('status: ', '')
  if (action.startsWith('stock:')) return 'Perubahan stok: ' + action.replace('stock: ', '')
  return action
}

const entityLabels = {
  order: 'Order',
  product_variant: 'Varian Produk',
  pickup_chain: 'Metode Pengambilan',
  customer: 'Pelanggan',
  user: 'Staf',
}

export default function AuditLog() {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    listActivityLog(page).then((res) => {
      setItems(res.items)
      setLoading(false)
    })
  }

  useEffect(reload, [page])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">Waktu</th>
              <th className="p-3">Aktor</th>
              <th className="p-3">Entitas</th>
              <th className="p-3">Aksi</th>
              <th className="p-3">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400">Belum ada aktivitas tercatat.</td></tr>
            )}
            {items.map((e, i) => (
              <tr key={i}>
                <td className="p-3 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString('en-US')}</td>
                <td className="p-3 font-medium text-gray-800">{e.actor_name}</td>
                <td className="p-3 font-mono text-xs text-gray-600">{entityLabels[e.entity_type] || e.entity_type} #{e.entity_id}</td>
                <td className="p-3 text-gray-700">{actionLabel(e.action)}</td>
                <td className="p-3 text-gray-500">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40">Sebelumnya</button>
        <button onClick={() => setPage((p) => p + 1)} disabled={items.length < 50} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40">Berikutnya</button>
      </div>
    </div>
  )
}
