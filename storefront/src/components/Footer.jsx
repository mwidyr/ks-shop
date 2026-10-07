import { useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribeNewsletter } from '../lib/api'
import { useStore } from '../lib/useSettings'
import { Logo } from './Icons'

export default function Footer() {
  const { categories } = useStore()
  const [email, setEmail] = useState('')
  const [agree, setAgree] = useState(false)
  const [state, setState] = useState({ status: 'idle', message: '' })

  async function submit(e) {
    e.preventDefault()
    setState({ status: 'loading', message: '' })
    try {
      await subscribeNewsletter(email)
      setState({ status: 'ok', message: 'Terima kasih! Kamu sudah terdaftar di newsletter Ralulu.' })
      setEmail('')
    } catch (err) {
      setState({ status: 'error', message: err.message })
    }
  }

  return (
    <footer className="mt-20">
      <section className="bg-gray-100 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl tracking-wide">TREN FASHION TERUS BERKEMBANG. JANGAN SAMPAI KETINGGALAN!</h2>
          <p className="text-sm text-gray-600 mt-3">Jadi yang pertama tahu produk terbaru dan promo seru dari Ralulu. Daftarkan emailmu di sini.</p>
          <form onSubmit={submit} className="mt-6 space-y-3 text-left">
            <div className="flex gap-2">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Masukkan email" className="input bg-white" />
              <button className="btn btn-dark" disabled={!agree || state.status === 'loading'}>Kirim</button>
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              Saya bersedia menerima email newsletter Ralulu dan telah membaca <Link to="/info/privasi" className="underline">Kebijakan Privasi</Link>.
            </label>
            {state.message && <p className={`text-sm ${state.status === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{state.message}</p>}
          </form>
        </div>
      </section>

      <section className="bg-black text-white px-4 py-12">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2 md:col-span-1">
            <Logo className="[&_img]:bg-white [&_img]:rounded-lg" />
            <p className="text-gray-400 mt-4 text-xs leading-relaxed">Fashion terbaru dengan harga bersahabat. Belanja mudah, pengiriman cepat, dan garansi tukar.</p>
          </div>
          <div>
            <h3 className="font-semibold uppercase tracking-wide mb-3">Bantuan</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/info/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link to="/info/pembayaran" className="hover:text-white">Pembayaran</Link></li>
              <li><Link to="/info/retur" className="hover:text-white">Penukaran & Pengembalian</Link></li>
              <li><Link to="/info/privasi" className="hover:text-white">Kebijakan Privasi</Link></li>
              <li><Link to="/info/kontak" className="hover:text-white">Hubungi Kami</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold uppercase tracking-wide mb-3">Customer</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/promo" className="hover:text-white">Voucher</Link></li>
              <li><Link to="/lacak" className="hover:text-white">Lacak Pesanan</Link></li>
              <li><Link to="/keranjang" className="hover:text-white">Keranjang</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold uppercase tracking-wide mb-3">Produk</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/sale" className="hover:text-white">Sale</Link></li>
              <li><Link to="/koleksi/baru" className="hover:text-white">Koleksi Baru</Link></li>
              {categories.slice(0, 5).map((c) => <li key={c.name}><Link to={`/kategori/${encodeURIComponent(c.name)}`} className="hover:text-white">{c.display}</Link></li>)}
            </ul>
          </div>
        </div>
        <p className="max-w-7xl mx-auto mt-10 pt-6 border-t border-white/10 text-xs text-gray-500">Hak Cipta © {new Date().getFullYear()} Ralulu. Semua hak dilindungi undang-undang.</p>
      </section>
    </footer>
  )
}
