import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listAffiliates, createAffiliate, updateAffiliate, deleteAffiliate } from '../api/affiliates'

// Minimal Affiliate reference-list manager (Sales Channel Attribution, items 040-045) - the PDF
// explicitly scopes out the full Affiliate/Agent system for now, so this is just enough to
// create/rename/deactivate the Affiliates that Order Creation and the analytics pages need,
// same shape as Host Management's Location Tags manager.
export default function Affiliates() {
  const { t } = useTranslation()
  const [affiliates, setAffiliates] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function reload() {
    listAffiliates(true).then(setAffiliates)
  }

  useEffect(reload, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createAffiliate({ name })
      setName('')
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_affiliates.save_error'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a) {
    await updateAffiliate(a.id, { name: a.name, is_active: !a.is_active })
    reload()
  }

  async function handleDelete(a) {
    setError('')
    try {
      await deleteAffiliate(a.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_affiliates.delete_error'))
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-1">{t('page_affiliates.title')}</h2>
        <p className="text-xs text-gray-400 mb-4">{t('page_affiliates.hint')}</p>

        <div className="divide-y mb-4">
          {affiliates.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className={a.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}>{a.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(a)} className="text-xs font-medium text-gray-600 hover:underline">
                  {a.is_active ? t('page_affiliates.deactivate') : t('page_affiliates.activate')}
                </button>
                <button onClick={() => handleDelete(a)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            </div>
          ))}
          {affiliates.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_affiliates.empty_state')}</p>}
        </div>

        <form onSubmit={handleCreate} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('page_affiliates.placeholder_name')} required className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
            {saving ? t('page_affiliates.saving') : t('common.add')}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  )
}
