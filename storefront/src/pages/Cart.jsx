import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { useQuote } from '../lib/useQuote'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'
import { CartLine } from '../components/CartDrawer'

export default function Cart() {
  const cart = useCart()
  const { settings } = useStore()
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState('')
  const { quote } = useQuote({ items: cart.items, code: applied })
  const free = settings?.free_shipping_minimarket || 0

  if (cart.items.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center px-4">
        <h1 className="font-display text-4xl tracking-wide">KERANJANG KOSONG</h1>
        <p className="text-gray-500 mt-3 text-sm">Yuk, temukan fashion favoritmu.</p>
        <Link to="/produk" className="btn btn-dark mt-6">Mulai belanja</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-8">
      <h1 className="font-display text-4xl tracking-wide">KERANJANG</h1>
      <div className="grid md:grid-cols-[1fr_340px] gap-10 mt-6">
        <ul className="divide-y border-y">
          {cart.items.map((i) => <CartLine key={i.variantId} item={i} cart={{ ...cart, closeDrawer: () => {} }} />)}
        </ul>
        <aside className="border p-5 h-fit space-y-4">
          <h2 className="font-semibold uppercase tracking-wide text-sm">Ringkasan</h2>
          <form onSubmit={(e) => { e.preventDefault(); setApplied(code.trim().toUpperCase()) }} className="flex gap-2">
            <input className="input uppercase" placeholder="Kode voucher" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-outline !px-4">Pakai</button>
          </form>
          {quote?.promotion_error && <p className="text-xs text-red-600">{quote.promotion_error}</p>}
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(quote?.subtotal ?? cart.subtotal)}</dd></div>
            {quote?.discount > 0 && <div className="flex justify-between text-green-700"><dt>Voucher {applied}</dt><dd>-{money(quote.discount)}</dd></div>}
            <div className="flex justify-between text-gray-500"><dt>Ongkir</dt><dd>dihitung saat checkout</dd></div>
          </dl>
          {free > 0 && <p className="text-xs text-gray-500">Gratis ongkir untuk pembelian min. {money(free)}.</p>}
          <Link to={`/checkout${applied && !quote?.promotion_error ? `?kode=${applied}` : ''}`} className="btn btn-dark w-full">Lanjut ke checkout</Link>
        </aside>
      </div>
    </div>
  )
}
