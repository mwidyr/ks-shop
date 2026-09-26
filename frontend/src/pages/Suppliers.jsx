import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { listSuppliers, createSupplier } from '../api/suppliers'

const emptyForm = { name: '', category: '', source: '' }
const statusColors = { active: 'bg-green-100 text-green-700', paused: 'bg-amber-100 text-amber-700', inactive: 'bg-gray-100 text-gray-500' }

export default function Suppliers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function reload() {
    listSuppliers(true).then(setSuppliers)
  }

  useEffect(reload, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await createSupplier(form)
      navigate(`/suppliers/${res.id}`)
    } catch (err) {
      setError(err.response?.data?.error || t('page_suppliers.error_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">{t('page_suppliers.title')}</h2>

        <div className="divide-y mb-4">
          {suppliers.map((s) => (
            <Link key={s.id} to={`/suppliers/${s.id}`} className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-500">{[s.category, s.contact_name, s.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[s.status] || statusColors.active}`}>
                {t(`page_suppliers.status_${s.status}`)}
              </span>
            </Link>
          ))}
          {suppliers.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_suppliers.empty_state')}</p>}
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-3 gap-2">
          <input placeholder={t('page_suppliers.placeholder_name')} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-3 sm:col-span-1" />
          <input placeholder={t('page_suppliers.placeholder_category')} value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder={t('page_suppliers.placeholder_source')} value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg col-span-3 sm:col-span-1">
            {saving ? t('page_suppliers.saving') : t('page_suppliers.add_button')}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-gray-400 mt-2">{t('page_suppliers.create_hint')}</p>
      </div>
    </div>
  )
}
