import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFeeSettings, updateFeeSettings } from '../api/settings'

function FeeSettingsCard() {
  const { t } = useTranslation()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { getFeeSettings().then(setForm) }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await updateFeeSettings({
        platform_fee_pct: Number(form.platform_fee_pct),
        payment_fee_pct: Number(form.payment_fee_pct),
        shipping_subsidy_flat: Number(form.shipping_subsidy_flat),
        ad_cost_flat: Number(form.ad_cost_flat),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!form) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-bold text-gray-800 mb-1">{t('page_settings.fee_assumption_title')}</h2>
      <p className="text-xs text-gray-500 mb-4">{t('page_settings.fee_assumption_desc')}</p>
      <form onSubmit={save} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_settings.label_platform_fee')}</label>
          <input type="number" step="0.1" value={form.platform_fee_pct} onChange={(e) => update('platform_fee_pct', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_settings.label_payment_fee')}</label>
          <input type="number" step="0.1" value={form.payment_fee_pct} onChange={(e) => update('payment_fee_pct', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_settings.label_shipping_subsidy')}</label>
          <input type="number" value={form.shipping_subsidy_flat} onChange={(e) => update('shipping_subsidy_flat', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_settings.label_ad_cost')}</label>
          <input type="number" value={form.ad_cost_flat} onChange={(e) => update('ad_cost_flat', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="col-span-2 md:col-span-4 flex items-center gap-3">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? t('page_settings.saving') : t('common.save')}
          </button>
          {saved && <span className="text-xs text-green-600">{t('page_settings.saved_label')}</span>}
        </div>
      </form>
    </div>
  )
}

export default function Settings() {
  const { t } = useTranslation()
  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">
        {t('page_settings.moved_settings_notice_prefix')}
        <span className="font-semibold"> {t('nav.items.hosts')}</span> {t('page_settings.and')} <span className="font-semibold">{t('nav.items.shipping_settings')}</span> {t('page_settings.moved_settings_notice_suffix')}
      </p>
      <FeeSettingsCard />
    </div>
  )
}
