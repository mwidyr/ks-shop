import { Link } from 'react-router-dom'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'
import VoucherCard from '../components/VoucherCard'

export default function Promo() {
  const { promotions, settings } = useStore()
  const free = settings?.free_shipping_minimarket || 0
  return (
    <div className="max-w-5xl mx-auto px-4 pt-10">
      <h1 className="font-display text-4xl tracking-wide">PROMO & VOUCHER</h1>
      {free > 0 && (
        <div className="bg-black text-white p-6 mt-6">
          <p className="font-display text-3xl tracking-wide">PASTI GRATIS ONGKIR</p>
          <p className="text-sm text-gray-300 mt-1">Untuk pembelian min. {money(free)}. Otomatis berlaku saat checkout.</p>
        </div>
      )}
      <h2 className="font-semibold uppercase tracking-wide text-sm mt-10 mb-3">Voucher aktif</h2>
      {promotions.length === 0 ? <p className="text-sm text-gray-500">Belum ada voucher aktif saat ini.</p> : (
        <div className="grid sm:grid-cols-2 gap-3">{promotions.map((p) => <VoucherCard key={p.code} promo={p} />)}</div>
      )}
      <section className="mt-12 border-t pt-8">
        <h2 className="font-semibold uppercase tracking-wide text-sm mb-3">Cara pakai voucher</h2>
        <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1.5">
          <li>Pilih produk dan tambahkan ke keranjang.</li>
          <li>Buka keranjang atau checkout.</li>
          <li>Tempel kode voucher di kolom "Kode voucher", lalu tekan "Pakai".</li>
          <li>Potongan harga langsung terlihat di total pesanan.</li>
        </ol>
        <Link to="/produk" className="btn btn-dark mt-6">Belanja sekarang</Link>
      </section>
    </div>
  )
}
