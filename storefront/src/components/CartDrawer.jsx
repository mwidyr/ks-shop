import { Link } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { useStore } from '../lib/useSettings'
import { img, onImgError } from '../lib/api'
import { money } from '../lib/format'
import { CloseIcon } from './Icons'

export default function CartDrawer() {
  const cart = useCart()
  const { settings } = useStore()
  const threshold = settings?.free_shipping_minimarket || 0
  const remaining = Math.max(threshold - cart.subtotal, 0)

  if (!cart.drawerOpen) return null
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Keranjang">
      <div className="absolute inset-0 bg-black/40" onClick={cart.closeDrawer} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Keranjang ({cart.count})</h2>
          <button onClick={cart.closeDrawer} aria-label="Tutup"><CloseIcon /></button>
        </div>

        {threshold > 0 && cart.items.length > 0 && (
          <div className="px-5 py-3 bg-gray-50 border-b text-xs">
            {remaining > 0 ? <p>Belanja <b>{money(remaining)}</b> lagi untuk <b>gratis ongkir</b></p> : <p className="text-green-700 font-semibold">Selamat! Kamu dapat gratis ongkir 🎉</p>}
            <div className="h-1.5 bg-gray-200 mt-2"><div className="h-full bg-brand-600" style={{ width: `${Math.min(100, (cart.subtotal / threshold) * 100)}%` }} /></div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5">
          {cart.items.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              <p>Keranjangmu masih kosong.</p>
              <Link to="/produk" onClick={cart.closeDrawer} className="btn btn-dark mt-5">Mulai belanja</Link>
            </div>
          ) : (
            <ul className="divide-y">
              {cart.items.map((i) => <CartLine key={i.variantId} item={i} cart={cart} />)}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t px-5 py-4 space-y-3">
            <div className="flex justify-between font-semibold"><span>Subtotal</span><span>{money(cart.subtotal)}</span></div>
            <p className="text-xs text-gray-500">Ongkir dan kode voucher dihitung saat checkout.</p>
            <Link to="/checkout" onClick={cart.closeDrawer} className="btn btn-dark w-full">Checkout</Link>
            <Link to="/keranjang" onClick={cart.closeDrawer} className="btn btn-outline w-full">Lihat keranjang</Link>
          </div>
        )}
      </aside>
    </div>
  )
}

export function CartLine({ item: i, cart }) {
  return (
    <li className="flex gap-3 py-4">
      <Link to={`/produk/${i.productId}`} onClick={cart.closeDrawer} className="w-20 h-24 bg-gray-100 shrink-0 overflow-hidden">
        <img src={img(i.image)} alt="" onError={onImgError} className="w-full h-full object-cover" />
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/produk/${i.productId}`} onClick={cart.closeDrawer} className="text-sm font-medium line-clamp-2 hover:underline">{i.name}</Link>
        <p className="text-xs text-gray-500 mt-0.5">{[i.color, i.size].filter(Boolean).join(' / ')}</p>
        <p className="text-sm font-semibold mt-1">{money(i.price)}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="inline-flex items-center border">
            <button className="w-8 h-8" onClick={() => cart.setQty(i.variantId, i.qty - 1)} aria-label="Kurangi">−</button>
            <span className="w-8 text-center text-sm">{i.qty}</span>
            <button className="w-8 h-8 disabled:opacity-30" disabled={i.stock && i.qty >= i.stock} onClick={() => cart.setQty(i.variantId, i.qty + 1)} aria-label="Tambah">+</button>
          </div>
          <button className="text-xs text-gray-500 underline" onClick={() => cart.remove(i.variantId)}>Hapus</button>
        </div>
      </div>
    </li>
  )
}
