import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getProducts, img, onImgError } from '../lib/api'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'
import { CloseIcon, SearchIcon } from './Icons'

// Full-width search with "kata kunci populer" (categories) and live product suggestions.
export default function SearchOverlay({ onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [popular, setPopular] = useState([])
  const { categories } = useStore()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    getProducts({ sort: 'bestseller', limit: 4 }).then((d) => setPopular(d.products)).catch(() => {})
  }, [])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults(null); return undefined }
    const t = setTimeout(() => {
      getProducts({ q: term, limit: 6 }).then((d) => setResults(d.products)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function submit(e) {
    e.preventDefault()
    if (!q.trim()) return
    onClose()
    navigate(`/produk?q=${encodeURIComponent(q.trim())}`)
  }

  const list = results ?? popular
  return (
    <div className="fixed inset-0 z-[80] bg-white overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-12">
        <div className="flex items-center gap-3">
          <form onSubmit={submit} className="flex-1 flex items-center border-b-2 border-black">
            <SearchIcon />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk, kategori, atau kode..." className="flex-1 px-3 py-3 outline-none text-base" />
          </form>
          <button onClick={onClose} aria-label="Tutup pencarian"><CloseIcon /></button>
        </div>

        {categories.length > 0 && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Kata kunci populer</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Link key={c.name} to={`/kategori/${encodeURIComponent(c.name)}`} onClick={onClose} className="border px-3 py-1.5 text-sm hover:bg-black hover:text-white transition">{c.display}</Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">{results ? `Hasil untuk "${q.trim()}"` : 'Banyak dicari'}</p>
          {results && results.length === 0 && <p className="text-sm text-gray-500">Tidak ada produk yang cocok.</p>}
          <ul className="grid sm:grid-cols-2 gap-3">
            {list.map((p) => (
              <li key={p.id}>
                <Link to={`/produk/${p.id}`} onClick={onClose} className="flex gap-3 items-center hover:bg-gray-50 p-2">
                  <div className="w-14 h-[72px] bg-gray-100 shrink-0 overflow-hidden"><img src={img(p.images[0])} alt="" onError={onImgError} className="w-full h-full object-cover" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{p.name}</p>
                    <p className="text-sm text-gray-600">{money(p.price)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {results && results.length > 0 && (
            <button onClick={submit} className="mt-4 text-sm underline">Lihat semua hasil</button>
          )}
        </div>
      </div>
    </div>
  )
}
