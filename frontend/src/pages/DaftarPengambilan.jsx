import { useEffect, useState } from 'react'
import { getPickingQueue, pickOrderItem } from '../api/orders'
import { listProducts } from '../api/products'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PickingLineItem from '../components/PickingLineItem'
import { statusLabels } from '../components/StatusPill'

const statusOptions = ['picking', 'pending', 'ready_to_ship']
const sortOptions = [
  { value: '', labelKey: 'page_picking.sort_oldest' },
  { value: 'newest', labelKey: 'page_picking.sort_newest' },
  { value: 'product_code', labelKey: 'page_picking.sort_product_code' },
  { value: 'customer', labelKey: 'page_picking.sort_customer' },
]

export default function DaftarPengambilan() {
  const { t } = useTranslation()
  const [data, setData] = useState({ items: [], total: 0 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('picking')
  const [ready, setReady] = useState('')
  const [sort, setSort] = useState('')
  const [productCode, setProductCode] = useState('')
  const [customer, setCustomer] = useState('')
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [colors, setColors] = useState([])
  const [sizes, setSizes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listProducts().then((products) => {
      const allVariants = products.flatMap((p) => p.variants)
      setColors([...new Set(allVariants.map((v) => v.color).filter(Boolean))].sort())
      setSizes([...new Set(allVariants.map((v) => v.size).filter(Boolean))].sort())
    })
  }, [])

  function fetchQueue() {
    setLoading(true)
    getPickingQueue({
      q: search, status, ready, sort,
      product_code: productCode, customer, color, size,
      page_size: 100,
    }).then((res) => {
      setData(res)
      setLoading(false)
    })
  }

  useEffect(fetchQueue, [search, status, ready, sort, productCode, customer, color, size])

  async function handlePick(itemId, pickedQty) {
    await pickOrderItem(itemId, pickedQty)
    fetchQueue()
  }

  const totalQty = data.items.reduce((s, it) => s + it.qty, 0)
  const totalPicked = data.items.reduce((s, it) => s + it.picked_qty, 0)

  // Group flat items by order so items from the same order render in one box with a single
  // order-number header, instead of repeating the order badge on every row.
  const orderGroups = []
  const groupIndex = new Map()
  for (const it of data.items) {
    if (!groupIndex.has(it.order_id)) {
      groupIndex.set(it.order_id, orderGroups.length)
      orderGroups.push({ orderId: it.order_id, orderNo: it.order_no, customerName: it.customer_name, items: [] })
    }
    orderGroups[groupIndex.get(it.order_id)].items.push(it)
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('page_picking.search_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            {statusOptions.map((s) => <option key={s} value={s}>{t(`status.${s}`, statusLabels[s])}</option>)}
          </select>
          <select value={ready} onChange={(e) => setReady(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">{t('page_picking.readiness_all')}</option>
            <option value="true">{t('page_picking.readiness_ready')}</option>
            <option value="false">{t('page_picking.readiness_not_ready')}</option>
          </select>
          <select value={color} onChange={(e) => setColor(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">{t('page_picking.filter_color_all')}</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">{t('page_picking.filter_size_all')}</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            placeholder={t('page_picking.filter_product_code_placeholder')}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-36"
          />
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder={t('page_picking.filter_customer_placeholder')}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-36"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            {sortOptions.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">{t('page_picking.item_count_label', { count: data.total })}</p>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('common.loading')}</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_picking.empty_state')}</div>
      ) : (
        <div className="space-y-3">
          {orderGroups.map((group) => (
            <div key={group.orderId} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <Link to={`/orders/${group.orderId}`} className="text-xs font-semibold text-brand-600 hover:underline">{group.orderNo}</Link>
                <span className="text-xs text-gray-400">{group.customerName}</span>
              </div>
              <div className="space-y-2">
                {group.items.map((it) => (
                  <PickingLineItem
                    key={it.item_id}
                    itemId={it.item_id}
                    sku={it.product_sku}
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
                  />
                ))}
              </div>
            </div>
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
