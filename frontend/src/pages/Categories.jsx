import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories, createCategory, updateCategory, deleteCategory, mergeCategory } from '../api/categories'

export default function Categories() {
  const { t } = useTranslation()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [nameZh, setNameZh] = useState('')
  const [nameId, setNameId] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editNameId, setEditNameId] = useState('')
  const [mergingId, setMergingId] = useState(null)
  const [mergeTarget, setMergeTarget] = useState('')

  function reload() {
    listCategories().then((data) => {
      setCategories(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!nameZh.trim() || !nameId.trim()) return
    setAdding(true)
    setError('')
    try {
      await createCategory(nameZh.trim(), nameId.trim())
      setNameZh('')
      setNameId('')
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

  function startEdit(c) {
    setEditingId(c.id)
    setEditNameId(c.name_id)
  }

  async function saveEdit() {
    await updateCategory(editingId, editNameId.trim())
    setEditingId(null)
    reload()
  }

  function startMerge(id) {
    setMergingId(id)
    setMergeTarget('')
  }

  async function confirmMerge(c) {
    if (!mergeTarget) return
    const target = categories.find((x) => String(x.id) === mergeTarget)
    if (!target) return
    if (!window.confirm(t('page_categories.merge_confirm', { source: c.name_zh, target: target.name_zh }))) return
    await mergeCategory(c.id, target.id)
    setMergingId(null)
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <h2 className="font-bold text-gray-800 mb-1">{t('page_categories.add_category_title')}</h2>
        <form onSubmit={handleAdd} className="flex gap-2 mt-3">
          <input
            value={nameZh}
            onChange={(e) => setNameZh(e.target.value)}
            placeholder={t('page_categories.name_zh_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={nameId}
            onChange={(e) => setNameId(e.target.value)}
            placeholder={t('page_categories.name_id_placeholder')}
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
            <div key={c.id} className="flex items-center justify-between p-4 gap-3">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800">{c.name_zh}</span>
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editNameId}
                    onChange={(e) => setEditNameId(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } }}
                    className="ml-2 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                ) : (
                  <button type="button" onClick={() => startEdit(c)} className="ml-2 text-sm text-gray-500 hover:underline">
                    {c.name_id}
                  </button>
                )}
              </div>
              {mergingId === c.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    <option value="">{t('page_categories.merge_target_placeholder')}</option>
                    {categories.filter((x) => x.id !== c.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.name_zh} / {x.name_id}</option>
                    ))}
                  </select>
                  <button onClick={() => confirmMerge(c)} disabled={!mergeTarget} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40">{t('page_categories.merge_confirm_button')}</button>
                  <button onClick={() => setMergingId(null)} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600">{t('page_categories.product_count', { count: c.product_count })}</span>
                  <button onClick={() => startMerge(c.id)} className="text-xs font-semibold text-gray-500 hover:underline">{t('page_categories.merge_button')}</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-semibold text-red-600 hover:underline">{t('common.delete')}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
