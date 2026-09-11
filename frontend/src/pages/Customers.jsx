import { useEffect, useMemo, useState } from 'react'
import { listCustomerStats, setCustomerLabel, deleteCustomer } from '../api/customers'
import { listOrders } from '../api/orders'
import { formatRupiah } from '../utils/format'
import BigStatCard from '../components/BigStatCard'
import StatusPill from '../components/StatusPill'

const availableLabels = [
  { key: 'vip', label: 'VIP' },
  { key: 'blacklist', label: 'Daftar Hitam' },
  { key: 'sering_retur', label: 'Sering Retur' },
  { key: 'pelanggan_baru', label: 'Pelanggan Baru' },
]

const segmentLabels = {
  new: 'Baru', returning: 'Returning', vip: 'VIP', high_value: 'High Value', inactive: 'Inactive',
}
const segmentColors = {
  new: 'bg-blue-100 text-blue-700',
  returning: 'bg-indigo-100 text-indigo-700',
  vip: 'bg-yellow-100 text-yellow-700',
  high_value: 'bg-purple-100 text-purple-700',
  inactive: 'bg-gray-100 text-gray-500',
}

function CustomerDetail({ customer, onClose, onChanged }) {
  const [orders, setOrders] = useState(null)
  const [labels, setLabels] = useState(new Set(customer.labels || []))
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    listOrders({ q: customer.phone, page_size: 10 }).then((res) => setOrders(res.items))
  }, [customer.phone])

  async function toggleLabel(key) {
    const enabled = !labels.has(key)
    await setCustomerLabel(customer.id, key, enabled)
    setLabels((s) => {
      const next = new Set(s)
      if (enabled) next.add(key)
      else next.delete(key)
      return next
    })
    onChanged()
  }

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteCustomer(customer.id)
      onChanged()
      onClose()
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Gagal menghapus pelanggan')
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">{customer.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">Tutup</button>
        </div>
        <p className="text-sm text-gray-500 mb-1">{customer.phone}</p>
        <p className="text-sm text-gray-500 mb-4">{customer.address || '-'}</p>
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-4 ${segmentColors[customer.segment]}`}>
          {segmentLabels[customer.segment]}
        </span>

        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Label</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {availableLabels.map((l) => (
            <button
              key={l.key}
              onClick={() => toggleLabel(l.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                labels.has(l.key)
                  ? l.key === 'blacklist' ? 'bg-red-600 border-red-600 text-white' : 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 uppercase">Total Order</p>
            <p className="text-lg font-bold text-gray-800">{customer.order_count}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 uppercase">Lifetime Value</p>
            <p className="text-lg font-bold text-brand-600">{formatRupiah(customer.total_spend)}</p>
          </div>
        </div>
        <h3 className="text-sm font-bold text-gray-700 mb-2">Riwayat Order</h3>
        {!orders ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada order.</p>
        ) : (
          <div className="divide-y">
            {orders.map((o) => (
              <div key={o.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-700">{o.order_no}</p>
                  <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('id-ID')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-brand-600">{formatRupiah(o.total)}</p>
                  <StatusPill status={o.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border border-red-200 bg-red-50 rounded-xl p-4">
          <p className="text-xs font-bold text-red-600 uppercase mb-2">Tindakan Berbahaya</p>
          <button onClick={handleDelete} className="w-full text-sm font-semibold text-red-600 border border-red-300 rounded-lg py-2 hover:bg-red-100">
            Hapus pelanggan ini
          </button>
          {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
        </div>
      </div>
    </div>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  function reload() {
    listCustomerStats().then((data) => {
      setCustomers(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  const counts = useMemo(() => {
    const c = { vip: 0, returning: 0, inactive: 0, high_value: 0, new: 0 }
    customers.forEach((cu) => { c[cu.segment] = (c[cu.segment] || 0) + 1 })
    return c
  }, [customers])

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (segment && c.segment !== segment) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false
      }
      return true
    })
  }, [customers, segment, search])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex flex-wrap gap-4 mb-6">
        <BigStatCard title="Total Customer" value={customers.length} iconBg="bg-blue-50" iconColor="text-blue-600" icon="👥" />
        <BigStatCard title="VIP" value={counts.vip} iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="⭐" />
        <BigStatCard title="Returning" value={counts.returning} iconBg="bg-indigo-50" iconColor="text-indigo-600" icon="🔁" />
        <BigStatCard title="Inactive" value={counts.inactive} iconBg="bg-gray-50" iconColor="text-gray-500" icon="💤" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau HP..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
        />
        {['', 'new', 'returning', 'vip', 'high_value', 'inactive'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setSegment(s)}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border ${
              segment === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {s ? segmentLabels[s] : 'Semua'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat customer...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-3">Nama</th>
                <th className="p-3">HP</th>
                <th className="p-3">Orders</th>
                <th className="p-3">Total Spending</th>
                <th className="p-3">Last Order</th>
                <th className="p-3">Segment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(c)}>
                  <td className="p-3 font-medium text-gray-800">{c.name}</td>
                  <td className="p-3 text-gray-500">{c.phone}</td>
                  <td className="p-3 text-gray-500">{c.order_count}</td>
                  <td className="p-3 font-semibold text-brand-600">{formatRupiah(c.total_spend)}</td>
                  <td className="p-3 text-gray-500">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('id-ID') : '-'}</td>
                  <td className="p-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${segmentColors[c.segment]}`}>
                      {segmentLabels[c.segment]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  )
}
