import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories, createCategory } from '../api/categories'
import { useMasterData } from '../context/MasterDataContext'

const NEW_CATEGORY = '__new__'

// Dropdown backed by the real categories table, plus a "+ Kategori baru" option that reveals
// two inputs (Chinese + Indonesian name) for typing a brand new category (created for real on
// save). value/onChange always carry the Chinese name - that's the canonical string stored on
// products.category; the Indonesian name is only ever used to translate the displayed label.
export default function CategorySelect({ value, onChange }) {
  const { t } = useTranslation()
  const { translateCategory } = useMasterData()
  const [categories, setCategories] = useState([])
  const [addingNew, setAddingNew] = useState(false)
  const [newNameID, setNewNameID] = useState('')

  useEffect(() => {
    listCategories().then(setCategories)
  }, [])

  const names = categories.map((c) => c.name).sort()

  async function commitNewCategory() {
    if (value && !names.includes(value)) {
      try {
        await createCategory(value, newNameID)
      } catch {
        // category might already exist from a concurrent add; ignore
      }
    }
  }

  useEffect(() => {
    if (value && !names.includes(value) && names.length > 0) {
      setAddingNew(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, value])

  function handleSelect(e) {
    const v = e.target.value
    if (v === NEW_CATEGORY) {
      setAddingNew(true)
      setNewNameID('')
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
          placeholder={t('shared.category_new_placeholder_zh')}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          value={newNameID}
          onChange={(e) => setNewNameID(e.target.value)}
          onBlur={commitNewCategory}
          placeholder={t('shared.category_new_placeholder_id')}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {names.length > 0 && (
          <button
            type="button"
            onClick={() => { setAddingNew(false); onChange('') }}
            className="text-sm text-gray-500 px-2 hover:underline"
          >
            {t('common.cancel')}
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
      <option value="">{t('shared.category_choose')}</option>
      {names.map((c) => <option key={c} value={c}>{translateCategory(c)}</option>)}
      <option value={NEW_CATEGORY}>{t('shared.category_new_option')}</option>
    </select>
  )
}
