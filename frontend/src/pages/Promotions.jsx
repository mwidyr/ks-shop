import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPromotions, createPromotion, updatePromotion, deletePromotion } from '../api/promotions'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  code: '', type: 'fixed_amount', value: '', min_order_amount: '',
  start_date: '', end_date: '', usage_limit: '', per_customer_limit: '',
  combinable: false, is_active: true,
}

function toPayload(form) {
  return {
    code: form.code.trim().toUpperCase(),
    type: form.type,
    value: form.type === 'free_shipping' ? 0 : Number(form.value) || 0,
    min_order_amount: Number(form.min_order_amount) || 0,
    start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
    end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
    usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null,
    combinable: form.combinable,
    is_active: form.is_active,
  }
}

function toForm(p) {
  return {
    code: p.code || '', type: p.type, value: p.value || '', min_order_amount: p.min_order_amount || '',
    start_date: p.start_date ? p.start_date.slice(0, 10) : '', end_date: p.end_date ? p.end_date.slice(0, 10) : '',
    usage_limit: p.usage_limit ?? '', per_customer_limit: p.per_customer_limit ?? '',
    combinable: p.combinable, is_active: p.is_active,
  }
}

export default function Promotions() {
  const { t } = useTranslation()
  const [promotions, setPromotions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function reload() {
    listPromotions().then(setPromotions)
  }
  useEffect(reload, [])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
  }

  function startEdit(p) {
    setEditingId(p.id)
    setForm(toForm(p))
    setShowForm(true)
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editingId) {
        await updatePromotion(editingId, toPayload(form))
      } else {
        await createPromotion(toPayload(form))
      }
      setShowForm(false)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_promotions.error_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(id) {
    if (!window.confirm(t('page_promotions.deactivate_confirm'))) return
    await deletePromotion(id)
    reload()
  }

  function formatValue(p) {
    if (p.type === 'free_shipping') return t('page_promotions.type_free_shipping')
    if (p.type === 'percentage') return `${p.value}%`
    return formatCurrency(p.value)
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800">{t('page_promotions.title')}</h2>
            <p className="text-xs text-gray-500">{t('page_promotions.description')}</p>
          </div>
          <button type="button" onClick={startCreate} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
            {t('page_promotions.add_button')}
          </button>
        </div>

        <div className="divide-y">
          {promotions.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 font-mono">{p.code}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.is_active ? t('page_promotions.status_active') : t('page_promotions.status_inactive')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t(`page_promotions.type_${p.type}`)} · {formatValue(p)}
                  {p.min_order_amount > 0 && ` · ${t('page_promotions.min_order_label')} ${formatCurrency(p.min_order_amount)}`}
                  {' · '}{t('page_promotions.used_count', { count: p.usage_count, limit: p.usage_limit ?? '∞' })}
                </p>
                {(p.start_date || p.end_date) && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {p.start_date ? new Date(p.start_date).toLocaleDateString() : '—'} → {p.end_date ? new Date(p.end_date).toLocaleDateString() : '—'}
                  </p>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                <button type="button" onClick={() => startEdit(p)} className="text-xs font-semibold text-brand-600 hover:underline">{t('page_promotions.edit_button')}</button>
                {p.is_active && (
                  <button type="button" onClick={() => handleDeactivate(p.id)} className="text-xs font-semibold text-red-600 hover:underline">{t('page_promotions.deactivate_button')}</button>
                )}
              </div>
            </div>
          ))}
          {promotions.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_promotions.empty_state')}</p>}
        </div>

        {showForm && (
          <form onSubmit={handleSave} className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.code_label')}</label>
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder={t('page_promotions.code_placeholder')} required className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm uppercase" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.type_label')}</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="fixed_amount">{t('page_promotions.type_fixed_amount')}</option>
                <option value="percentage">{t('page_promotions.type_percentage')}</option>
                <option value="free_shipping">{t('page_promotions.type_free_shipping')}</option>
              </select>
            </div>
            {form.type !== 'free_shipping' && (
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  {t('page_promotions.value_label')} — {form.type === 'percentage' ? t('page_promotions.value_hint_percentage') : t('page_promotions.value_hint_fixed')}
                </label>
                <input type="number" min="0" max={form.type === 'percentage' ? 100 : undefined} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.min_order_label')}</label>
              <input type="number" min="0" value={form.min_order_amount} onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))} placeholder="0" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.start_date_label')}</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.end_date_label')}</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.usage_limit_label')}</label>
              <input type="number" min="1" value={form.usage_limit} onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))} placeholder={t('page_promotions.usage_limit_hint')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('page_promotions.per_customer_limit_label')}</label>
              <input type="number" min="1" value={form.per_customer_limit} onChange={(e) => setForm((f) => ({ ...f, per_customer_limit: e.target.value }))} placeholder={t('page_promotions.per_customer_limit_hint')} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.combinable} onChange={(e) => setForm((f) => ({ ...f, combinable: e.target.checked }))} className="w-4 h-4" />
                {t('page_promotions.combinable_label')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4" />
                {t('page_promotions.active_label')}
              </label>
            </div>
            {error && <p className="col-span-2 text-xs text-red-600">{error}</p>}
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                {saving ? t('page_promotions.saving') : t('page_promotions.save_button')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:underline px-2">{t('page_promotions.cancel_button')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
