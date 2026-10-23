import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listColors, createColor, updateColor, deleteColor, mergeColor } from '../api/colors'

export default function ColorManagement() {
  const { t } = useTranslation()
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(true)
  const [nameZh, setNameZh] = useState('')
  const [nameId, setNameId] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editField, setEditField] = useState('name_id') // name_id | name_en
  const [editValue, setEditValue] = useState('')
  const [mergingId, setMergingId] = useState(null)
  const [mergeTarget, setMergeTarget] = useState('')

  function reload() {
    listColors().then((data) => {
      setColors(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!nameZh.trim() || !nameId.trim() || !nameEn.trim()) return
    setAdding(true)
    setError('')
    try {
      await createColor(nameZh.trim(), nameId.trim(), nameEn.trim())
      setNameZh('')
      setNameId('')
      setNameEn('')
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_colors.add_failed'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    await deleteColor(id)
    reload()
  }

  function startEdit(c, field) {
    setEditingId(c.id)
    setEditField(field)
    setEditValue(c[field] || '')
  }

  // A new English name also recomputes the SKUs of every variant in this color (C002-BLACK-F).
  async function saveEdit() {
    const value = editValue.trim()
    const current = colors.find((x) => x.id === editingId)
    if (!value || value === (current?.[editField] || '')) { setEditingId(null); return }
    if (editField === 'name_en' && current?.used_count > 0 && !window.confirm(t('page_colors.name_en_change_confirm', { count: current.used_count }))) {
      setEditingId(null)
      return
    }
    setError('')
    try {
      await updateColor(editingId, { [editField]: value })
    } catch (err) {
      setError(err.response?.data?.error || t('page_colors.add_failed'))
    }
    setEditingId(null)
    reload()
  }

  function startMerge(id) {
    setMergingId(id)
    setMergeTarget('')
  }

  async function confirmMerge(c) {
    if (!mergeTarget) return
    const target = colors.find((x) => String(x.id) === mergeTarget)
    if (!target) return
    if (!window.confirm(t('page_colors.merge_confirm', { source: c.name_zh, target: target.name_zh }))) return
    await mergeColor(c.id, target.id)
    setMergingId(null)
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <h2 className="font-bold text-gray-800 mb-1">{t('page_colors.add_color_title')}</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mt-3">
          <input
            value={nameZh}
            onChange={(e) => setNameZh(e.target.value)}
            placeholder={t('page_colors.name_zh_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={nameId}
            onChange={(e) => setNameId(e.target.value)}
            placeholder={t('page_colors.name_id_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={t('page_colors.name_en_placeholder')}
            title={t('page_colors.name_en_hint')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={adding} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            {adding ? t('page_colors.adding') : t('page_colors.add_button')}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_colors.loading_colors')}</p>
      ) : colors.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">
          {t('page_colors.empty_state')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {colors.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4 gap-3">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800">{c.name_zh}</span>
                {['name_id', 'name_en'].map((field) => (editingId === c.id && editField === field ? (
                  <input
                    key={field}
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } }}
                    className="ml-2 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                ) : (
                  <button key={field} type="button" onClick={() => startEdit(c, field)} title={field === 'name_en' ? t('page_colors.name_en_hint') : undefined}
                    className={`ml-2 text-sm hover:underline ${field === 'name_en' && !c.name_en ? 'text-amber-600' : 'text-gray-500'}`}>
                    {field === 'name_en' ? `EN: ${c.name_en || t('page_colors.name_en_missing')}` : c.name_id}
                  </button>
                )))}
              </div>
              {mergingId === c.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    <option value="">{t('page_colors.merge_target_placeholder')}</option>
                    {colors.filter((x) => x.id !== c.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.name_zh} / {x.name_id}{x.name_en ? ` / ${x.name_en}` : ''}</option>
                    ))}
                  </select>
                  <button onClick={() => confirmMerge(c)} disabled={!mergeTarget} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40">{t('page_colors.merge_confirm_button')}</button>
                  <button onClick={() => setMergingId(null)} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link to={`/products?color=${encodeURIComponent(c.name_zh)}`} title={t('page_colors.view_products')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 hover:underline">{t('page_colors.used_count', { count: c.used_count })}</Link>
                  <button onClick={() => startMerge(c.id)} className="text-xs font-semibold text-gray-500 hover:underline">{t('page_colors.merge_button')}</button>
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
