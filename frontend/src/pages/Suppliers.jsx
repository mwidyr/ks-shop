import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers'

const emptyForm = { name: '', contact_name: '', phone: '', address: '' }

export default function Suppliers() {
  const { t } = useTranslation()
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
      await createSupplier(form)
      setForm(emptyForm)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_suppliers.error_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s) {
    await updateSupplier(s.id, { ...s, is_active: !s.is_active })
    reload()
  }

  async function handleDelete(s) {
    setError('')
    try {
      await deleteSupplier(s.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_suppliers.error_delete_failed'))
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">{t('page_suppliers.title')}</h2>

        <div className="divide-y mb-4">
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-500">{[s.contact_name, s.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.is_active ? t('page_suppliers.status_active') : t('page_suppliers.status_inactive')}
                </span>
                <button onClick={() => toggleActive(s)} className="text-xs text-brand-600 hover:underline">
                  {s.is_active ? t('page_suppliers.action_deactivate') : t('page_suppliers.action_activate')}
                </button>
                <button onClick={() => handleDelete(s)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_suppliers.empty_state')}</p>}
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-2">
          <input placeholder={t('page_suppliers.placeholder_name')} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" />
          <input placeholder={t('page_suppliers.placeholder_contact_name')} value={form.contact_name} onChange={(e) => setForm((s) => ({ ...s, contact_name: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder={t('page_suppliers.placeholder_phone')} value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder={t('page_suppliers.placeholder_address')} value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" />
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg col-span-2">
            {saving ? t('page_suppliers.saving') : t('page_suppliers.add_button')}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  )
}
