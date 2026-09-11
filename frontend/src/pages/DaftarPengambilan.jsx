import { useEffect, useState } from 'react'
import { getPickingQueue, pickOrderItem } from '../api/orders'
import { Link } from 'react-router-dom'
import PickingLineItem from '../components/PickingLineItem'
import FilterChip from '../components/FilterChip'

export default function DaftarPengambilan() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  function fetchQueue() {
    setLoading(true)
    getPickingQueue({ q: search, status: statusFilter, page_size: 100 }).then((res) => {
      setData(res)
      setLoading(false)
    })
  }

  useEffect(fetchQueue, [search, statusFilter])

  async function handlePick(itemId, pickedQty) {
    await pickOrderItem(itemId, pickedQty)
    fetchQueue()
  }

  const totalQty = data.items.reduce((s, it) => s + it.qty, 0)
  const totalPicked = data.items.reduce((s, it) => s + it.picked_qty, 0)

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk / kode / pelanggan / no. pesanan..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2 flex-wrap">
          <FilterChip label={statusFilter ? `Status: ${statusFilter}` : 'Semua Status'} active={!!statusFilter} onClick={() => {}} onClear={() => setStatusFilter('')} />
          {['confirm', 'packing', 'picking'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">ITEM · {data.total}</p>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat...</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">Tidak ada item yang perlu diambil.</div>
      ) : (
        <div className="space-y-3">
          {data.items.map((it) => (
            <PickingLineItem
              key={it.item_id}
              itemId={it.item_id}
              sku={it.sku}
              productName={it.product_name}
              imageUrl={it.image_url}
              color={it.color}
              size={it.size}
              qty={it.qty}
              pickedQty={it.picked_qty}
              availableToPick={it.available_to_pick}
              physicalStock={it.physical_stock}
              isOversell={it.is_oversell}
              hostName={it.host_name}
              onPick={handlePick}
              meta={
                <div className="flex items-center justify-between mb-0.5">
                  <Link to={`/orders/${it.order_id}`} className="text-xs font-semibold text-brand-600 hover:underline">{it.order_no}</Link>
                  <span className="text-xs text-gray-400">{it.customer_name}</span>
                </div>
              }
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 bg-white border-t border-gray-200 mt-4 p-3 flex items-center justify-around text-center text-sm rounded-b-2xl shadow-sm">
        <div><p className="text-[11px] text-gray-400 uppercase">Baris</p><p className="font-bold text-gray-800">{data.items.length}</p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">Total</p><p className="font-bold text-gray-800">{data.total}</p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">Ambil</p><p className="font-bold text-gray-800">{totalPicked}/{totalQty}</p></div>
      </div>
    </div>
  )
}
