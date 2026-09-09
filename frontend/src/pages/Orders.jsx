import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrders, updateOrderStatus } from '../api/orders'
import { listHosts } from '../api/hosts'
import { listCouriers } from '../api/couriers'
import { listProducts } from '../api/products'
import { getSummary } from '../api/dashboard'
import { formatRupiah } from '../utils/format'
import StatusPill, { statusLabels } from '../components/StatusPill'
import DateRangePicker from '../components/DateRangePicker'
import BigStatCard from '../components/BigStatCard'
import { IconArrowRight, IconEye } from '../components/icons'

function IconX(props) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const nextStatus = {
  pending: 'confirm', confirm: 'packing', packing: 'picking', picking: 'shipped', shipped: 'delivered',
}

export default function Orders() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 20 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [hostId, setHostId] = useState('')
  const [category, setCategory] = useState('')
  const [courierId, setCourierId] = useState('')
  const [range, setRange] = useState(null)
  const [page, setPage] = useState(1)
  const [advancing, setAdvancing] = useState(null)

  const [hosts, setHosts] = useState([])
  const [couriers, setCouriers] = useState([])
  const [categories, setCategories] = useState([])

  const [selected, setSelected] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  useEffect(() => {
    listHosts(true).then(setHosts)
    listCouriers(true).then(setCouriers)
    listProducts().then((products) => {
      setCategories([...new Set(products.map((p) => p.category).filter(Boolean))])
    })
  }, [])

  function fetchOrders() {
    if (!range) return
    setLoading(true)
    listOrders({
      q: search, status, host_id: hostId, category, courier_id: courierId,
      date_from: range.from, date_to: range.to, page, page_size: 20,
    }).then((res) => {
      setData(res)
      setLoading(false)
      setSelected(new Set())
    })
    getSummary(range).then(setSummary)
  }

  useEffect(fetchOrders, [search, status, hostId, category, courierId, range, page])

  function resetFilters() {
    setSearch(''); setStatus(''); setHostId(''); setCategory(''); setCourierId(''); setPage(1)
  }

  async function handleAdvance(order) {
    const to = nextStatus[order.status]
    if (!to) return
    setAdvancing(order.id)
    try {
      await updateOrderStatus(order.id, to, '')
      fetchOrders()
    } finally {
      setAdvancing(null)
    }
  }

  async function handleReject(order) {
    setAdvancing(order.id)
    try {
      await updateOrderStatus(order.id, 'cancelled', 'Ditolak oleh seller')
      fetchOrders()
    } finally {
      setAdvancing(null)
    }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === data.items.length ? new Set() : new Set(data.items.map((o) => o.id))))
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return
    setBulkBusy(true)
    setBulkResult('')
    const results = await Promise.allSettled(
      [...selected].map((id) => updateOrderStatus(id, bulkStatus, ''))
    )
    const okCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.length - okCount
    setBulkResult(failCount > 0
      ? `${okCount} order berhasil diubah, ${failCount} dilewati (transisi status tidak valid)`
      : `${okCount} order berhasil diubah ke ${statusLabels[bulkStatus]}`)
    setBulkStatus('')
    setBulkBusy(false)
    fetchOrders()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size))
  const counts = summary?.order_status_counts || {}
  const revenue = summary?.order_status_revenue || {}
  const processing = ['confirm', 'packing', 'picking', 'shipped'].reduce((sum, s) => sum + (counts[s] || 0), 0)
  const processingRevenue = ['confirm', 'packing', 'picking', 'shipped'].reduce((sum, s) => sum + (revenue[s] || 0), 0)

  return (
    <div className="px-4 sm:px-6 py-6">
      {summary && (
        <div className="flex flex-wrap gap-4 mb-6">
          <BigStatCard title="Total Order" value={Object.values(counts).reduce((a, b) => a + b, 0)} subLabel={`${summary.total_qty} item`} iconBg="bg-blue-50" iconColor="text-blue-600" icon="📦" />
          <BigStatCard title="Total Revenue" value={formatRupiah(summary.total_revenue)} iconBg="bg-green-50" iconColor="text-green-600" icon="💰" />
          <BigStatCard title="Menunggu Konfirmasi" value={formatRupiah(revenue.pending || 0)} subLabel={`${counts.pending || 0} order`} iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="⏳" />
          <BigStatCard title="Sedang Diproses" value={formatRupiah(processingRevenue)} subLabel={`${processing} order`} iconBg="bg-indigo-50" iconColor="text-indigo-600" icon="🚚" />
          <BigStatCard title="Selesai" value={formatRupiah(revenue.delivered || 0)} subLabel={`${counts.delivered || 0} order`} iconBg="bg-green-50" iconColor="text-green-600" icon="✅" />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(1) }} />
          <Link to="/orders/new" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            + Buat Order Baru
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari nama atau HP customer..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <select value={hostId} onChange={(e) => { setHostId(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Semua Host</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Semua Kategori</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={courierId} onChange={(e) => { setCourierId(e.target.value); setPage(1) }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Semua Kurir</option>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={resetFilters} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
            Reset
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {['', ...Object.keys(statusLabels)].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => { setStatus(s); setPage(1) }}
              className={`shrink-0 text-sm font-medium px-4 py-1.5 rounded-full border ${
                status === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s ? statusLabels[s] : 'Semua Status'}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-brand-800">{selected.size} order dipilih</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Ubah status ke...</option>
            {Object.keys(statusLabels).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={!bulkStatus || bulkBusy}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
          >
            {bulkBusy ? 'Menerapkan...' : 'Terapkan'}
          </button>
          <a
            href={`/orders/print/invoice?ids=${[...selected].join(',')}`}
            target="_blank" rel="noreferrer"
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
          >
            Cetak Invoice Terpilih
          </a>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:underline">
            Batal
          </button>
        </div>
      )}
      {bulkResult && <p className="text-sm text-gray-600 mb-4">{bulkResult}</p>}

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat order...</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">Belum ada order.</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={selected.size === data.items.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="p-3">No. Order</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Host</th>
                  <th className="p-3">Kurir</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((o) => (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selected.has(o.id) ? 'bg-brand-50/40' : ''}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td className="p-3 font-semibold text-gray-800">{o.order_no}</td>
                    <td className="p-3">
                      <p className="text-gray-700">{o.customer_name}</p>
                      <p className="text-xs text-gray-400">{o.customer_phone}</p>
                    </td>
                    <td className="p-3 text-gray-700 font-medium">{o.host_names}</td>
                    <td className="p-3 text-gray-500">{o.courier_name}</td>
                    <td className="p-3 text-gray-500">{o.total_qty}</td>
                    <td className="p-3 font-semibold text-brand-600">{formatRupiah(o.total)}</td>
                    <td className="p-3"><StatusPill status={o.status} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/orders/${o.id}`} title="Lihat" className="text-gray-400 hover:text-brand-600">
                          <IconEye />
                        </Link>
                        {o.status === 'pending' && (
                          <button
                            onClick={() => handleReject(o)}
                            disabled={advancing === o.id}
                            title="Tolak Order"
                            className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <IconX />
                          </button>
                        )}
                        {nextStatus[o.status] && (
                          <button
                            onClick={() => handleAdvance(o)}
                            disabled={advancing === o.id}
                            title={o.status === 'pending' ? 'Terima Order' : `Lanjutkan ke ${statusLabels[nextStatus[o.status]]}`}
                            className="text-gray-400 hover:text-brand-600 disabled:opacity-40"
                          >
                            <IconArrowRight />
                          </button>
                        )}
                        <a
                          href={`/orders/${o.id}/print/invoice`}
                          target="_blank" rel="noreferrer"
                          title="Cetak Invoice"
                          className="text-gray-400 hover:text-brand-600"
                        >
                          🖨️
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>Halaman {data.page} dari {totalPages} ({data.total} order)</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
