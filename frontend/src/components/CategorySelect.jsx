import { useEffect, useState } from 'react'
import { listCategories, createCategory } from '../api/categories'

const NEW_CATEGORY = '__new__'

// Dropdown backed by the real categories table, plus a "+ Kategori baru" option that reveals
// a text input for typing a brand new category (which gets created for real on save).
export default function CategorySelect({ value, onChange }) {
  const [categories, setCategories] = useState([])
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    listCategories().then((cats) => {
      setCategories(cats.map((c) => c.name).sort())
    })
  }, [])

  async function commitNewCategory() {
    if (value && !categories.includes(value)) {
      try {
        await createCategory(value)
      } catch {
        // category might already exist from a concurrent add; ignore
      }
    }
  }

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
          onBlur={commitNewCategory}
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
