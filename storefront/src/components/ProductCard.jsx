import { Link } from 'react-router-dom'
import { img, onImgError } from '../lib/api'
import { money, discountPct } from '../lib/format'

export default function ProductCard({ p }) {
  const pct = discountPct(p.price, p.compare_at)
  const first = p.images[0]
  const second = p.images[1]
  return (
    <Link to={`/produk/${p.id}`} className="group block">
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        <img src={img(first)} alt={p.name} loading="lazy" onError={onImgError} className={`absolute inset-0 w-full h-full object-cover transition duration-500 ${second ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
        {second && <img src={img(second)} alt="" loading="lazy" onError={onImgError} className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition duration-500" />}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {pct > 0 && <span className="bg-red-600 text-white text-[11px] font-semibold px-2 py-0.5">-{pct}%</span>}
          {!p.in_stock && <span className="bg-black text-white text-[11px] font-semibold px-2 py-0.5">Habis</span>}
        </div>
      </div>
      <div className="pt-3">
        {p.category_display && <p className="text-[11px] uppercase tracking-wide text-gray-500">{p.category_display}</p>}
        <h3 className="text-sm font-medium leading-snug line-clamp-2 mt-0.5 group-hover:underline">{p.name}</h3>
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${pct > 0 ? 'text-red-600' : ''}`}>{money(p.price)}</span>
          {pct > 0 && <span className="text-xs text-gray-400 line-through">{money(p.compare_at)}</span>}
        </div>
        {p.colors.length > 1 && <p className="text-[11px] text-gray-500 mt-1">{p.colors.length} warna</p>}
      </div>
    </Link>
  )
}

export function ProductGrid({ products, cols = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' }) {
  return (
    <div className={`grid ${cols} gap-x-3 gap-y-8 md:gap-x-5`}>
      {products.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  )
}

export function ProductGridSkeleton({ n = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 md:gap-x-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[3/4] bg-gray-100" />
          <div className="h-3 bg-gray-100 mt-3 w-3/4" />
          <div className="h-3 bg-gray-100 mt-2 w-1/3" />
        </div>
      ))}
    </div>
  )
}
