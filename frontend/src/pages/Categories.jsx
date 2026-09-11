import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories, createCategory, deleteCategory } from '../api/categories'

export default function Categories() {
  const { t } = useTranslation()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    listCategories().then((data) => {
      setCategories(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      await createCategory(name.trim())
      setName('')
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_categories.add_failed'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    await deleteCategory(id)
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <h2 className="font-bold text-gray-800 mb-1">{t('page_categories.add_category_title')}</h2>
        <form onSubmit={handleAdd} className="flex gap-2 mt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('page_categories.name_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={adding} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            {adding ? t('page_categories.adding') : t('page_categories.add_button')}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_categories.loading_categories')}</p>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">
          {t('page_categories.empty_state')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-gray-800">{c.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600">{t('page_categories.product_count', { count: c.product_count })}</span>
                <button onClick={() => handleDelete(c.id)} className="text-xs font-semibold text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
