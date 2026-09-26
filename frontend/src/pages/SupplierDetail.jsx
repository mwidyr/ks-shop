import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getSupplier, updateSupplier, createSupplierContact, deleteSupplierContact,
  createSupplierNote, createSupplierPriceReference, deleteSupplierPriceReference,
} from '../api/suppliers'

const statuses = ['active', 'paused', 'inactive']
const contactMethods = ['wechat', 'phone', 'whatsapp', 'other']

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function SupplierDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [contactForm, setContactForm] = useState({ contact_name: '', method: 'whatsapp', value: '' })
  const [noteText, setNoteText] = useState('')
  const [priceForm, setPriceForm] = useState({ category: '', price_min: '', price_max: '' })

  function reload() {
    getSupplier(id).then((s) => { setSupplier(s); setForm(s) })
  }

  useEffect(reload, [id])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await updateSupplier(id, form)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_suppliers.error_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function addContact(e) {
    e.preventDefault()
    if (!contactForm.value) return
    await createSupplierContact(id, contactForm)
    setContactForm({ contact_name: '', method: 'whatsapp', value: '' })
    reload()
  }

  async function addNote(e) {
    e.preventDefault()
    if (!noteText.trim()) return
    await createSupplierNote(id, noteText.trim())
    setNoteText('')
    reload()
  }

  async function addPriceRef(e) {
    e.preventDefault()
    if (!priceForm.category) return
    await createSupplierPriceReference(id, {
      category: priceForm.category,
      price_min: priceForm.price_min === '' ? null : Number(priceForm.price_min),
      price_max: priceForm.price_max === '' ? null : Number(priceForm.price_max),
    })
    setPriceForm({ category: '', price_min: '', price_max: '' })
    reload()
  }

  if (!supplier || !form) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl space-y-6">
      <button onClick={() => navigate('/suppliers')} className="text-sm text-gray-500 hover:text-gray-800">
        ← {t('page_suppliers.back_button')}
      </button>

      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-gray-800">{t('page_suppliers.profile_title')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label={t('page_suppliers.field_name')}>
            <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.field_status')}>
            <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              {statuses.map((s) => <option key={s} value={s}>{t(`page_suppliers.status_${s}`)}</option>)}
            </select>
          </Field>
          <Field label={t('page_suppliers.field_source')}>
            <input value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.field_category')}>
            <input value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.field_payment_method')}>
            <input value={form.payment_method} onChange={(e) => setForm((s) => ({ ...s, payment_method: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.field_lead_time')}>
            <input type="number" min="0" value={form.default_lead_time_days ?? ''} onChange={(e) => setForm((s) => ({ ...s, default_lead_time_days: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.field_address')}>
            <input value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
            <input type="checkbox" checked={form.customizable} onChange={(e) => setForm((s) => ({ ...s, customizable: e.target.checked }))} />
            {t('page_suppliers.field_customizable')}
          </label>
        </div>

        <h3 className="text-sm font-bold text-gray-700 pt-2">{t('page_suppliers.purchase_rules_title')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label={t('page_suppliers.rule_min_order_qty')}>
            <input type="number" min="0" value={form.min_order_qty ?? ''} onChange={(e) => setForm((s) => ({ ...s, min_order_qty: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.rule_min_color_qty')}>
            <input type="number" min="0" value={form.min_color_qty ?? ''} onChange={(e) => setForm((s) => ({ ...s, min_color_qty: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.rule_min_order_amount')}>
            <input type="number" min="0" value={form.min_order_amount ?? ''} onChange={(e) => setForm((s) => ({ ...s, min_order_amount: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.rule_order_multiple')}>
            <input type="number" min="0" value={form.order_multiple ?? ''} onChange={(e) => setForm((s) => ({ ...s, order_multiple: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <Field label={t('page_suppliers.rule_pack_set_qty')}>
            <input type="number" min="0" value={form.pack_set_qty ?? ''} onChange={(e) => setForm((s) => ({ ...s, pack_set_qty: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
            <input type="checkbox" checked={form.mixed_color_allowed} onChange={(e) => setForm((s) => ({ ...s, mixed_color_allowed: e.target.checked }))} />
            {t('page_suppliers.rule_mixed_color_allowed')}
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg">
          {saving ? t('page_suppliers.saving') : t('common.save')}
        </button>
      </form>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-3">{t('page_suppliers.contacts_title')}</h3>
          <div className="divide-y mb-3">
            {supplier.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="text-gray-800">{c.contact_name || '-'} <span className="text-gray-400">· {t(`page_suppliers.contact_method_${c.method}`)}</span></p>
                  <p className="text-gray-500 text-xs">{c.value}</p>
                </div>
                <button onClick={async () => { await deleteSupplierContact(id, c.id); reload() }} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            ))}
            {supplier.contacts.length === 0 && <p className="text-xs text-gray-400 py-2">{t('page_suppliers.empty_state')}</p>}
          </div>
          <form onSubmit={addContact} className="flex flex-wrap gap-2">
            <input placeholder={t('page_suppliers.field_name')} value={contactForm.contact_name} onChange={(e) => setContactForm((s) => ({ ...s, contact_name: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[100px]" />
            <select value={contactForm.method} onChange={(e) => setContactForm((s) => ({ ...s, method: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              {contactMethods.map((m) => <option key={m} value={m}>{t(`page_suppliers.contact_method_${m}`)}</option>)}
            </select>
            <input placeholder={t('page_suppliers.contact_value_placeholder')} value={contactForm.value} onChange={(e) => setContactForm((s) => ({ ...s, value: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
            <button type="submit" className="bg-gray-800 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{t('common.add')}</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-3">{t('page_suppliers.price_references_title')}</h3>
          <div className="divide-y mb-3">
            {supplier.price_references.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <p className="text-gray-800">{p.category} <span className="text-gray-400">· {p.price_min ?? '-'} – {p.price_max ?? '-'}</span></p>
                <button onClick={async () => { await deleteSupplierPriceReference(id, p.id); reload() }} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
              </div>
            ))}
            {supplier.price_references.length === 0 && <p className="text-xs text-gray-400 py-2">{t('page_suppliers.empty_state')}</p>}
          </div>
          <form onSubmit={addPriceRef} className="flex flex-wrap gap-2">
            <input placeholder={t('page_suppliers.field_category')} value={priceForm.category} onChange={(e) => setPriceForm((s) => ({ ...s, category: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[100px]" />
            <input type="number" placeholder={t('page_suppliers.price_min_placeholder')} value={priceForm.price_min} onChange={(e) => setPriceForm((s) => ({ ...s, price_min: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24" />
            <input type="number" placeholder={t('page_suppliers.price_max_placeholder')} value={priceForm.price_max} onChange={(e) => setPriceForm((s) => ({ ...s, price_max: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24" />
            <button type="submit" className="bg-gray-800 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{t('common.add')}</button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-3">{t('page_suppliers.notes_title')}</h3>
        <form onSubmit={addNote} className="flex gap-2 mb-3">
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t('page_suppliers.note_placeholder')} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          <button type="submit" className="bg-gray-800 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{t('common.add')}</button>
        </form>
        <div className="divide-y">
          {supplier.notes.map((n) => (
            <div key={n.id} className="py-2 text-sm">
              <p className="text-gray-800">{n.note}</p>
              <p className="text-xs text-gray-400">{n.created_by} · {new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))}
          {supplier.notes.length === 0 && <p className="text-xs text-gray-400 py-2">{t('page_suppliers.empty_state')}</p>}
        </div>
      </div>
    </div>
  )
}
