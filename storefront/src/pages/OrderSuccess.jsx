import { Link, useLocation, useParams } from 'react-router-dom'
import { money } from '../lib/format'

export default function OrderSuccess() {
  const { orderNo } = useParams()
  const { state } = useLocation()
  const o = state?.order
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mx-auto">✓</div>
      <h1 className="font-display text-4xl tracking-wide mt-5">PESANAN DITERIMA</h1>
      <p className="text-sm text-gray-600 mt-2">Terima kasih! Tim Ralulu akan menghubungimu lewat nomor HP untuk konfirmasi dan pembayaran.</p>
      <div className="border mt-8 p-5 text-left text-sm space-y-2">
        <div className="flex justify-between"><span className="text-gray-500">Nomor pesanan</span><span className="font-mono font-semibold">{orderNo}</span></div>
        {o && <>
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(o.subtotal)}</span></div>
          {o.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Voucher</span><span>-{money(o.discount)}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Ongkir</span><span>{o.shipping_fee > 0 ? money(o.shipping_fee) : 'Gratis'}</span></div>
          <div className="flex justify-between font-semibold border-t pt-2"><span>Total</span><span>{money(o.total)}</span></div>
        </>}
      </div>
      <p className="text-xs text-gray-500 mt-4">Simpan nomor pesanan ini untuk melacak status pesananmu.</p>
      <div className="flex gap-3 justify-center mt-8">
        <Link to={`/lacak?order_no=${orderNo}${state?.phone ? `&phone=${encodeURIComponent(state.phone)}` : ''}`} className="btn btn-outline">Lacak pesanan</Link>
        <Link to="/" className="btn btn-dark">Lanjut belanja</Link>
      </div>
    </div>
  )
}
