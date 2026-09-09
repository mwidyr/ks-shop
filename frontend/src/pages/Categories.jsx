import { useEffect, useState } from 'react'
import { listProducts } from '../api/products'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listProducts().then((products) => {
      const counts = {}
      products.forEach((p) => {
        const cat = p.category || 'Tanpa Kategori'
        counts[cat] = (counts[cat] || 0) + 1
      })
      setCategories(Object.entries(counts).sort((a, b) => b[1] - a[1]))
      setLoading(false)
    })
  }, [])

  return (
    <div className="px-4 sm:px-6 py-6">
      <p className="text-sm text-gray-500 mb-4">
        Daftar kategori diturunkan langsung dari data produk (read-only). Kategori baru dibuat
        lewat form tambah/edit produk.
      </p>
      {loading ? (
        <p className="text-gray-500 py-10 text-center">Memuat kategori...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {categories.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-gray-800">{name}</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600">{count} produk</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
