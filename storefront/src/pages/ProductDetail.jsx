import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProduct, getProducts, img } from '../lib/api'
import { useCart } from '../lib/cart'
import { useStore } from '../lib/useSettings'
import { discountPct, money } from '../lib/format'
import { ProductGrid } from '../components/ProductCard'

const MEASURE_LABEL = { bust: 'Lingkar dada', waist: 'Lingkar pinggang', length: 'Panjang', bottom_length: 'Panjang bawahan', elasticity: 'Elastisitas', note: 'Catatan' }

export default function ProductDetail() {
  const { id } = useParams()
  const cart = useCart()
  const { settings } = useStore()
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [active, setActive] = useState(0)
  const [related, setRelated] = useState([])
  const [added, setAdded] = useState(false)

  useEffect(() => {
    setP(null); setError(''); setActive(0); setQty(1); setColor(''); setSize('')
    getProduct(id).then((d) => {
      setP(d)
      const first = d.variants.find((v) => v.stock > 0) || d.variants[0]
      if (first) { setColor(first.color); setSize(first.size) }
      document.title = `${d.name} - Ralulu`
      getProducts({ category: d.category, limit: 5 }).then((r) => setRelated(r.products.filter((x) => x.id !== d.id).slice(0, 4))).catch(() => {})
    }).catch((e) => setError(e.status === 404 ? 'Produk tidak ditemukan.' : e.message))
    window.scrollTo(0, 0)
    return () => { document.title = 'Ralulu - Fashion Terbaru' }
  }, [id])

  const colors = useMemo(() => p?.colors || [], [p])
  const sizes = useMemo(() => [...new Set((p?.variants || []).filter((v) => !color || v.color === color).map((v) => v.size))], [p, color])
  const variant = useMemo(() => p?.variants.find((v) => v.color === color && v.size === size), [p, color, size])

  // keep the chosen size valid when the colour changes
  useEffect(() => {
    if (sizes.length && !sizes.includes(size)) setSize(sizes[0])
  }, [sizes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="max-w-xl mx-auto py-24 text-center"><p>{error}</p><Link to="/produk" className="btn btn-dark mt-6">Lihat produk lain</Link></div>
  if (!p) return <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-10 animate-pulse"><div className="aspect-[3/4] bg-gray-100" /><div className="space-y-4"><div className="h-6 bg-gray-100 w-2/3" /><div className="h-6 bg-gray-100 w-1/3" /></div></div>

  const price = variant?.price ?? p.price
  const compare = variant?.compare_at ?? p.compare_at
  const pct = discountPct(price, compare)
  const stock = variant?.stock ?? 0
  const free = settings?.free_shipping_minimarket || 0

  function add() {
    if (!variant || stock <= 0) return
    cart.add({
      variantId: variant.id, productId: p.id, name: p.name, color: variant.color, size: variant.size,
      price: variant.price, image: p.images[0] || '', stock: variant.stock,
    }, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6">
      <nav className="text-xs text-gray-500 mb-5">
        <Link to="/" className="hover:underline">Beranda</Link> / <Link to={`/kategori/${encodeURIComponent(p.category)}`} className="hover:underline">{p.category_display}</Link> / <span className="text-black">{p.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-14">
        {/* Gallery */}
        <div className="flex flex-col-reverse lg:flex-row gap-3">
          {p.images.length > 1 && (
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-[640px] no-scrollbar">
              {p.images.map((u, idx) => (
                <button key={u + idx} onClick={() => setActive(idx)} className={`w-16 h-20 shrink-0 bg-gray-100 overflow-hidden border-2 ${idx === active ? 'border-black' : 'border-transparent'}`}>
                  <img src={img(u)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1 aspect-[3/4] bg-gray-100 overflow-hidden">
            {p.images[active] && <img src={img(p.images[active])} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />}
            {pct > 0 && <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-2.5 py-1">-{pct}%</span>}
          </div>
        </div>

        {/* Info */}
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{p.category_display}{p.sku ? ` · ${p.sku}` : ''}</p>
          <h1 className="text-2xl md:text-3xl font-semibold leading-snug mt-1">{p.name}</h1>
          <div className="flex items-baseline gap-3 mt-3">
            <span className={`text-2xl font-semibold ${pct > 0 ? 'text-red-600' : ''}`}>{money(price)}</span>
            {pct > 0 && <span className="text-gray-400 line-through">{money(compare)}</span>}
          </div>

          {colors.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold">Warna: <span className="font-normal">{color}</span></p>
              <div className="flex flex-wrap gap-2 mt-2">
                {colors.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={`px-4 py-2 text-sm border ${c === color ? 'border-black bg-black text-white' : 'hover:border-black'}`}>{c}</button>
                ))}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">Ukuran: <span className="font-normal">{size}</span></p>
              <div className="flex flex-wrap gap-2 mt-2">
                {sizes.map((s) => {
                  const v = p.variants.find((x) => x.color === color && x.size === s)
                  const out = !v || v.stock <= 0
                  return <button key={s} onClick={() => setSize(s)} className={`min-w-[48px] px-4 py-2 text-sm border ${s === size ? 'border-black bg-black text-white' : out ? 'text-gray-300 line-through' : 'hover:border-black'}`}>{s}</button>
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4">
            <div className="inline-flex items-center border">
              <button className="w-10 h-11" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Kurangi">−</button>
              <span className="w-10 text-center">{qty}</span>
              <button className="w-10 h-11 disabled:opacity-30" disabled={qty >= Math.min(stock, 99)} onClick={() => setQty((q) => q + 1)} aria-label="Tambah">+</button>
            </div>
            <p className={`text-xs ${stock <= 0 ? 'text-red-600' : stock <= 5 ? 'text-orange-600' : 'text-gray-500'}`}>
              {stock <= 0 ? 'Stok habis' : stock <= 5 ? `Tersisa ${stock}` : 'Stok tersedia'}
            </p>
          </div>

          <button onClick={add} disabled={!variant || stock <= 0} className="btn btn-dark w-full mt-5 !py-4">
            {stock <= 0 ? 'Stok habis' : added ? 'Ditambahkan ✓' : 'Tambah ke keranjang'}
          </button>
          <p className="text-xs text-gray-500 mt-3">{free > 0 ? `Gratis ongkir untuk pembelian min. ${money(free)}. ` : ''}Kirim ke minimarket atau alamat rumah.</p>

          {p.description && (
            <section className="mt-8 border-t pt-6">
              <h2 className="font-semibold text-sm uppercase tracking-wide mb-2">Deskripsi</h2>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{p.description}</p>
            </section>
          )}
          {Object.keys(p.measurements || {}).length > 0 && (
            <section className="mt-6 border-t pt-6">
              <h2 className="font-semibold text-sm uppercase tracking-wide mb-2">Detail ukuran</h2>
              <dl className="text-sm grid grid-cols-2 gap-y-1.5">
                {Object.entries(p.measurements).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-gray-500">{MEASURE_LABEL[k] || k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-3xl tracking-wide mb-5">PRODUK SERUPA</h2>
          <ProductGrid products={related} cols="grid-cols-2 lg:grid-cols-4" />
        </section>
      )}
    </div>
  )
}
