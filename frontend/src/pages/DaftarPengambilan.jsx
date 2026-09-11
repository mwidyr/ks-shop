import { useEffect, useState } from 'react'
import { getPickingQueue, pickOrderItem } from '../api/orders'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PickingLineItem from '../components/PickingLineItem'

export default function DaftarPengambilan() {
  const { t } = useTranslation()
  const [data, setData] = useState({ items: [], total: 0 })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  function fetchQueue() {
    setLoading(true)
    getPickingQueue({ q: search, page_size: 100 }).then((res) => {
      setData(res)
      setLoading(false)
    })
  }

  useEffect(fetchQueue, [search])

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
          placeholder={t('page_picking.search_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <p className="text-sm text-gray-500 mb-3">{t('page_picking.item_count_label', { count: data.total })}</p>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('common.loading')}</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_picking.empty_state')}</div>
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
        <div><p className="text-[11px] text-gray-400 uppercase">{t('page_picking.row_label')}</p><p className="font-bold text-gray-800">{data.items.length}</p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">{t('page_picking.total_label')}</p><p className="font-bold text-gray-800">{data.total}</p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">{t('page_picking.picked_label')}</p><p className="font-bold text-gray-800">{totalPicked}/{totalQty}</p></div>
      </div>
    </div>
  )
}
