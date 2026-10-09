import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProducts } from '../lib/api'
import { useStore } from '../lib/useSettings'
import { img, onImgError } from '../lib/api'
import { money } from '../lib/format'
import HeroSlider from '../components/HeroSlider'
import VoucherCard from '../components/VoucherCard'
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard'
import { PackageIcon, ShieldIcon, TagIcon, TruckIcon } from '../components/Icons'

export default function Home() {
  const { settings, categories, promotions } = useStore()
  const [newest, setNewest] = useState(null)
  const [sale, setSale] = useState([])
  const [tab, setTab] = useState('')
  const [tabProducts, setTabProducts] = useState(null)

  useEffect(() => {
    getProducts({ sort: 'newest', limit: 8 }).then((d) => setNewest(d.products)).catch(() => setNewest([]))
    getProducts({ sale: 'true', sort: 'bestseller', limit: 4 }).then((d) => setSale(d.products)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!tab && categories.length) setTab(categories[0].name)
  }, [categories, tab])
  useEffect(() => {
    if (!tab) return
    setTabProducts(null)
    getProducts({ category: tab, limit: 8 }).then((d) => setTabProducts(d.products)).catch(() => setTabProducts([]))
  }, [tab])

  const slides = useMemo(() => (newest || []).filter((p) => p.images[0]).slice(0, 4).map((p, idx) => ({
    key: p.id,
    image: p.images[0],
    eyebrow: idx === 0 ? 'Koleksi Baru' : p.category_display || 'New Arrival',
    title: p.name.length > 38 ? `${p.name.slice(0, 36)}…` : p.name,
    text: p.description,
    to: `/produk/${p.id}`,
    cta: 'Belanja sekarang',
  })), [newest])

  const free = settings?.free_shipping_minimarket || 0

  return (
    <>
      <HeroSlider slides={slides} />

      {/* Collage: one tile per category, photo taken from its newest product */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-12">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {categories.slice(0, 6).map((c) => <CategoryTile key={c.name} c={c} />)}
          </div>
        </section>
      )}

      {/* Vouchers (tap to copy) */}
      {promotions.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-14">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-display text-3xl tracking-wide">VOUCHER UNTUKMU</h2>
            <Link to="/promo" className="text-sm underline">Lihat semua</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {promotions.slice(0, 6).map((p) => <VoucherCard key={p.code} promo={p} />)}
          </div>
        </section>
      )}

      {/* Why shop here */}
      <section className="max-w-7xl mx-auto px-4 mt-14">
        <h2 className="font-display text-3xl tracking-wide text-center mb-6">KENAPA BELANJA DI RALULU</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            [TruckIcon, 'Gratis Ongkir', free > 0 ? `Untuk pembelian min. ${money(free)}` : 'Promo gratis ongkir berkala'],
            [ShieldIcon, 'Jaminan Tukar', 'Barang cacat atau salah kirim? Kami tukar / refund.'],
            [PackageIcon, 'Kirim ke Minimarket', 'Ambil di 7-Eleven & FamilyMart terdekat, atau kirim ke alamat.'],
            [TagIcon, 'Voucher Setiap Hari', 'Salin kode voucher dan pakai saat checkout.'],
          ].map(([Icon, title, text]) => (
            <div key={title} className="border p-5 text-center">
              <Icon className="mx-auto text-brand-600" width={30} height={30} />
              <p className="font-semibold mt-3">{title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product range tabs */}
      <section className="max-w-7xl mx-auto px-4 mt-16">
        <h2 className="font-display text-3xl tracking-wide text-center">PILIH KATEGORI</h2>
        <div className="flex justify-center gap-2 flex-wrap mt-5 mb-8">
          {categories.map((c) => (
            <button key={c.name} onClick={() => setTab(c.name)} className={`px-5 py-2 text-sm font-semibold uppercase tracking-wide border ${tab === c.name ? 'bg-black text-white border-black' : 'hover:border-black'}`}>{c.display}</button>
          ))}
        </div>
        {tabProducts === null ? <ProductGridSkeleton n={4} /> : <ProductGrid products={tabProducts.slice(0, 4)} cols="grid-cols-2 lg:grid-cols-4" />}
        {tab && <div className="text-center mt-8"><Link to={`/kategori/${encodeURIComponent(tab)}`} className="btn btn-outline">Lihat semua</Link></div>}
      </section>

      {/* Newest */}
      <section className="max-w-7xl mx-auto px-4 mt-16">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-3xl tracking-wide">TERBARU DI RALULU</h2>
          <Link to="/koleksi/baru" className="text-sm underline">Lihat semua</Link>
        </div>
        {newest === null ? <ProductGridSkeleton n={4} /> : <ProductGrid products={newest.slice(0, 8)} />}
      </section>

      {sale.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-16">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-display text-3xl tracking-wide text-red-600">SALE</h2>
            <Link to="/sale" className="text-sm underline">Lihat semua</Link>
          </div>
          <ProductGrid products={sale} cols="grid-cols-2 lg:grid-cols-4" />
        </section>
      )}
    </>
  )
}

function CategoryTile({ c }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    getProducts({ category: c.name, limit: 1 }).then((d) => setP(d.products[0] || null)).catch(() => {})
  }, [c.name])
  return (
    <Link to={`/kategori/${encodeURIComponent(c.name)}`} className="group relative block aspect-[4/5] md:aspect-[3/2] bg-gray-200 overflow-hidden">
      {p && <img src={img(p.images[0])} alt="" loading="lazy" onError={onImgError} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 text-white">
        <p className="font-display text-3xl tracking-wide leading-none">{c.display.toUpperCase()}</p>
        <p className="text-xs mt-1 underline">Belanja sekarang</p>
      </div>
    </Link>
  )
}
