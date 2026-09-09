import { useEffect, useState } from 'react'
import { listProducts } from '../api/products'

const NEW_CATEGORY = '__new__'

// Dropdown of existing product categories plus a "+ Kategori baru" option that reveals
// a text input for typing a brand new category (category is stored as free text on Product).
export default function CategorySelect({ value, onChange }) {
  const [categories, setCategories] = useState([])
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    listProducts().then((products) => {
      setCategories([...new Set(products.map((p) => p.category).filter(Boolean))].sort())
    })
  }, [])

  useEffect(() => {
    if (value && !categories.includes(value) && categories.length > 0) {
      setAddingNew(true)
    }
  }, [categories, value])

  function handleSelect(e) {
    const v = e.target.value
    if (v === NEW_CATEGORY) {
      setAddingNew(true)
      onChange('')
    } else {
      setAddingNew(false)
      onChange(v)
    }
  }

  if (addingNew) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nama kategori baru"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => { setAddingNew(false); onChange('') }}
            className="text-sm text-gray-500 px-2 hover:underline"
          >
            Batal
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={handleSelect}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="">Pilih kategori</option>
      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CATEGORY}>+ Kategori baru...</option>
    </select>
  )
}
