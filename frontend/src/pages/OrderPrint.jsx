import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getOrder } from '../api/orders'
import { formatCurrency } from '../utils/format'

function InvoiceView({ order }) {
  const { t } = useTranslation()
  return (
    <div className="print-page">
      <h1 className="text-xl font-bold mb-1">{t('page_order_print.type_invoice')}</h1>
      <p className="text-sm mb-4">{order.order_no}</p>
      <p className="text-sm">{order.customer_name} · {order.customer_phone}</p>
      <p className="text-sm mb-4">{order.shipping_address}</p>
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">{t('page_order_print.col_product')}</th>
            <th className="py-1">{t('page_order_print.col_qty')}</th>
            <th className="py-1 text-right">{t('page_order_print.col_price')}</th>
            <th className="py-1 text-right">{t('page_order_print.col_subtotal')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i} className="border-b">
              <td className="py-1">{it.product_name} ({it.color}/{it.size})</td>
              <td className="py-1">{it.qty}</td>
              <td className="py-1 text-right">{formatCurrency(it.price)}</td>
              <td className="py-1 text-right">{formatCurrency(it.price * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm ml-auto w-56">
        <div className="flex justify-between"><span>{t('page_order_print.subtotal_label')}</span><span>{formatCurrency(order.subtotal)}</span></div>
        {order.discount_amount > 0 && <div className="flex justify-between"><span>{t('page_order_print.discount_label')}</span><span>-{formatCurrency(order.discount_amount)}</span></div>}
        {order.additional_amount > 0 && <div className="flex justify-between"><span>{t('page_order_print.additional_fee_label')}</span><span>+{formatCurrency(order.additional_amount)}</span></div>}
        <div className="flex justify-between font-bold border-t mt-1 pt-1"><span>{t('page_order_print.total_label')}</span><span>{formatCurrency(order.total)}</span></div>
      </div>
    </div>
  )
}

function LabelView({ order }) {
  const { t } = useTranslation()
  return (
    <div className="print-page border-2 border-black p-4">
      <p className="text-xs uppercase text-gray-500 mb-1">{t('page_order_print.ship_to_label')}</p>
      <p className="text-lg font-bold">{order.customer_name}</p>
      <p className="text-sm">{order.customer_phone}</p>
      <p className="text-sm mb-4">{order.shipping_address}</p>
      <p className="text-xs uppercase text-gray-500 mb-1">{t('page_order_print.pickup_method_label')}</p>
      <p className="text-base font-semibold mb-4">
        {order.pickup_chain_name}
        {order.pickup_store_name && ` · ${order.pickup_store_name}`}
        {order.pickup_store_code && ` #${order.pickup_store_code}`}
      </p>
      <p className="text-xs uppercase text-gray-500 mb-1">{t('page_order_print.order_no_label')}</p>
      <p className="text-base font-mono">{order.order_no}</p>
    </div>
  )
}

function PackingSlipView({ order }) {
  const { t } = useTranslation()
  return (
    <div className="print-page">
      <h1 className="text-xl font-bold mb-1">{t('page_order_print.type_packing_slip')}</h1>
      <p className="text-sm mb-4">{order.order_no} · {order.customer_name}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">☐</th>
            <th className="py-1">{t('page_order_print.col_sku')}</th>
            <th className="py-1">{t('page_order_print.col_product')}</th>
            <th className="py-1">{t('page_order_print.col_host')}</th>
            <th className="py-1 text-right">{t('page_order_print.col_qty')}</th>
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
  const { t } = useTranslation()
  const { id, type } = useParams()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState(null)

  const ids = id ? [id] : (searchParams.get('ids') || '').split(',').filter(Boolean)

  const typeLabels = {
    invoice: t('page_order_print.type_invoice'),
    label: t('page_order_print.type_label'),
    'packing-slip': t('page_order_print.type_packing_slip'),
  }

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
        <p className="text-sm text-gray-500">{t('page_order_print.header_summary', { typeLabel: typeLabels[type] || t('page_order_print.type_document'), count: ids.length })}</p>
        <button onClick={() => window.print()} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {t('page_order_print.print_button')}
        </button>
      </div>
      {!orders ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : (
        orders.map((o) => <View key={o.id} order={o} />)
      )}
    </div>
  )
}
