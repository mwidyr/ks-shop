import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { trackOrder } from '../lib/api'
import { money, STATUS_LABEL } from '../lib/format'

const STEPS = ['pending', 'picking', 'ready_to_ship', 'shipped', 'delivered']

export default function Track() {
  const [params] = useSearchParams()
  const [orderNo, setOrderNo] = useState(params.get('order_no') || '')
  const [phone, setPhone] = useState(params.get('phone') || '')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function search(e) {
    e?.preventDefault()
    setError(''); setOrder(null); setLoading(true)
    try { setOrder(await trackOrder(orderNo.trim(), phone.trim())) } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  useEffect(() => { if (params.get('order_no') && params.get('phone')) search() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const step = order ? STEPS.indexOf(order.status) : -1
  const stopped = order && (order.status === 'cancelled' || order.status === 'return')

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10">
      <h1 className="font-display text-4xl tracking-wide">LACAK PESANAN</h1>
      <form onSubmit={search} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 mt-6">
        <input className="input" required placeholder="Nomor pesanan (WEB-...)" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
        <input className="input" required placeholder="Nomor HP saat memesan" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        <button className="btn btn-dark" disabled={loading}>{loading ? 'Mencari…' : 'Lacak'}</button>
      </form>
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      {order && (
        <div className="border mt-8 p-5 space-y-5">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <div><p className="text-gray-500 text-xs">Nomor pesanan</p><p className="font-mono font-semibold">{order.order_no}</p></div>
            <div><p className="text-gray-500 text-xs">Dibuat</p><p>{new Date(order.created_at).toLocaleString('id-ID')}</p></div>
            <div><p className="text-gray-500 text-xs">Status</p><p className={`font-semibold ${stopped ? 'text-red-600' : 'text-brand-600'}`}>{STATUS_LABEL[order.status] || order.status}</p></div>
          </div>

          {!stopped && (
            <ol className="flex items-center">
              {STEPS.map((s, idx) => (
                <li key={s} className="flex-1 flex items-center last:flex-none">
                  <span className={`w-6 h-6 rounded-full text-[11px] flex items-center justify-center shrink-0 ${idx <= step ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{idx + 1}</span>
                  {idx < STEPS.length - 1 && <span className={`flex-1 h-0.5 ${idx < step ? 'bg-brand-600' : 'bg-gray-200'}`} />}
                </li>
              ))}
            </ol>
          )}
          {order.tracking_number && <p className="text-sm"><span className="text-gray-500">No. resi:</span> <span className="font-mono">{order.tracking_number}</span></p>}
          <p className="text-sm"><span className="text-gray-500">Tujuan:</span> {order.shipping_address}</p>

          <ul className="divide-y border-t">
            {order.items.map((i, idx) => (
              <li key={idx} className="py-3 flex justify-between text-sm gap-3">
                <span>{i.name} <span className="text-gray-500">({[i.color, i.size].filter(Boolean).join(' / ')}) × {i.qty}</span></span>
                <span>{money(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="text-sm space-y-1 border-t pt-3">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between"><dt>Diskon</dt><dd>-{money(order.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Ongkir</dt><dd>{order.shipping_fee > 0 ? money(order.shipping_fee) : 'Gratis'}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}
