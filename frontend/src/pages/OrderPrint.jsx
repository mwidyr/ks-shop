import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getOrder } from '../api/orders'
import { formatRupiah } from '../utils/format'

const typeLabels = { invoice: 'Invoice', label: 'Label Pengiriman', 'packing-slip': 'Packing Slip' }

function InvoiceView({ order }) {
  return (
    <div className="print-page">
      <h1 className="text-xl font-bold mb-1">Invoice</h1>
      <p className="text-sm mb-4">{order.order_no}</p>
      <p className="text-sm">{order.customer_name} · {order.customer_phone}</p>
      <p className="text-sm mb-4">{order.shipping_address}</p>
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Produk</th>
            <th className="py-1">Qty</th>
            <th className="py-1 text-right">Harga</th>
            <th className="py-1 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i} className="border-b">
              <td className="py-1">{it.product_name} ({it.color}/{it.size})</td>
              <td className="py-1">{it.qty}</td>
              <td className="py-1 text-right">{formatRupiah(it.price)}</td>
              <td className="py-1 text-right">{formatRupiah(it.price * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm ml-auto w-56">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(order.subtotal)}</span></div>
        {order.discount_amount > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{formatRupiah(order.discount_amount)}</span></div>}
        {order.additional_amount > 0 && <div className="flex justify-between"><span>Biaya Tambahan</span><span>+{formatRupiah(order.additional_amount)}</span></div>}
        <div className="flex justify-between font-bold border-t mt-1 pt-1"><span>Total</span><span>{formatRupiah(order.total)}</span></div>
      </div>
    </div>
  )
}

function LabelView({ order }) {
  return (
    <div className="print-page border-2 border-black p-4">
      <p className="text-xs uppercase text-gray-500 mb-1">Kirim ke</p>
      <p className="text-lg font-bold">{order.customer_name}</p>
      <p className="text-sm">{order.customer_phone}</p>
      <p className="text-sm mb-4">{order.shipping_address}</p>
      <p className="text-xs uppercase text-gray-500 mb-1">Kurir</p>
      <p className="text-base font-semibold mb-4">{order.courier_name}</p>
      <p className="text-xs uppercase text-gray-500 mb-1">No. Order</p>
      <p className="text-base font-mono">{order.order_no}</p>
    </div>
  )
}

function PackingSlipView({ order }) {
  return (
    <div className="print-page">
      <h1 className="text-xl font-bold mb-1">Packing Slip</h1>
      <p className="text-sm mb-4">{order.order_no} · {order.customer_name}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">☐</th>
            <th className="py-1">SKU</th>
            <th className="py-1">Produk</th>
            <th className="py-1">Host</th>
            <th className="py-1 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i} className="border-b">
              <td className="py-1">☐</td>
              <td className="py-1 font-mono">{it.sku}</td>
              <td className="py-1">{it.product_name} ({it.color}/{it.size})</td>
              <td className="py-1">{it.host_name}</td>
              <td className="py-1 text-right">{it.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const views = { invoice: InvoiceView, label: LabelView, 'packing-slip': PackingSlipView }

export default function OrderPrint() {
  const { id, type } = useParams()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState(null)

  const ids = id ? [id] : (searchParams.get('ids') || '').split(',').filter(Boolean)

  useEffect(() => {
    Promise.all(ids.map((oid) => getOrder(oid))).then((results) => {
      setOrders(results)
      setTimeout(() => window.print(), 300)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const View = views[type] || InvoiceView

  return (
    <div className="p-8 max-w-2xl mx-auto bg-white">
      <style>{`
        @media print { .no-print { display: none !important; } .print-page { page-break-after: always; } }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{typeLabels[type] || 'Dokumen'} — {ids.length} order</p>
        <button onClick={() => window.print()} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          Cetak
        </button>
      </div>
      {!orders ? (
        <p className="text-gray-500">Memuat...</p>
      ) : (
        orders.map((o) => <View key={o.id} order={o} />)
      )}
    </div>
  )
}
