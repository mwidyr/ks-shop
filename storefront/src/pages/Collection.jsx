import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getProducts } from '../lib/api'
import { useStore } from '../lib/useSettings'
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard'

const SORTS = [
  ['newest', 'Terbaru'],
  ['bestseller', 'Terlaris'],
  ['price_asc', 'Harga: rendah ke tinggi'],
  ['price_desc', 'Harga: tinggi ke rendah'],
]
const PRICE_RANGES = [
  ['', 'Semua harga', '', ''],
  ['lt500', 'Di bawah NT$ 500', '', 500],
  ['500-1000', 'NT$ 500 - 1.000', 500, 1000],
  ['gt1000', 'Di atas NT$ 1.000', 1000, ''],
]

// One listing page for every collection: all products, search results, a category, new
// arrivals (/koleksi/baru) and sale (/sale), with category + price + sort filters and paging.
export default function Collection({ mode }) {
  const { name } = useParams()
  const [params, setParams] = useSearchParams()
  const { categories } = useStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const q = params.get('q') || ''
  const category = mode === 'category' ? name : params.get('category') || ''
  const sort = params.get('sort') || (mode === 'new' ? 'newest' : 'newest')
  const price = params.get('price') || ''
  const page = Number(params.get('page') || 1)
  const range = PRICE_RANGES.find((r) => r[0] === price) || PRICE_RANGES[0]

  useEffect(() => {
    setData(null)
    setError('')
    getProducts({
      q, category, sort, page, limit: 12,
      sale: mode === 'sale' ? 'true' : '',
      min_price: range[2], max_price: range[3],
    }).then(setData).catch((e) => setError(e.message))
  }, [q, category, sort, page, price, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const catDisplay = categories.find((c) => c.name === category)?.display || category
  const title = mode === 'new' ? 'Koleksi Baru' : mode === 'sale' ? 'Sale' : mode === 'category' ? catDisplay : q ? `Hasil untuk "${q}"` : 'Semua Produk'
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-4">
      <nav className="text-xs text-gray-500 mb-4"><Link to="/" className="hover:underline">Beranda</Link> / <span className="text-black">{title}</span></nav>
      <h1 className="font-display text-4xl md:text-5xl tracking-wide">{title.toUpperCase()}</h1>

      <div className="flex flex-wrap items-center gap-3 mt-6 pb-4 border-b">
        {mode !== 'category' && categories.length > 0 && (
          <select value={category} onChange={(e) => set('category', e.target.value)} className="input !w-auto" aria-label="Kategori">
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.display}</option>)}
          </select>
        )}
        <select value={price} onChange={(e) => set('price', e.target.value)} className="input !w-auto" aria-label="Harga">
          {PRICE_RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {data && <span className="text-gray-500 hidden sm:inline">{data.total} produk</span>}
          <select value={sort} onChange={(e) => set('sort', e.target.value)} className="input !w-auto" aria-label="Urutkan">
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-8">
        {error ? <p className="text-red-600 text-sm">{error}</p>
          : data === null ? <ProductGridSkeleton n={8} />
          : data.products.length === 0 ? (
            <div className="py-20 text-center text-gray-500">
              <p>Tidak ada produk yang cocok dengan filter ini.</p>
              <Link to="/produk" className="btn btn-dark mt-5">Lihat semua produk</Link>
            </div>
          ) : <ProductGrid products={data.products} />}
      </div>

      {pages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-12">
          <button className="btn btn-outline !px-4 !py-2" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Sebelumnya</button>
          <span className="text-sm px-3">{page} / {pages}</span>
          <button className="btn btn-outline !px-4 !py-2" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Berikutnya</button>
        </div>
      )}
    </div>
  )
}
