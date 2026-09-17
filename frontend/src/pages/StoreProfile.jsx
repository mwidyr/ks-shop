import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStoreSettings, updateStoreSettings } from '../api/storeSettings'

export default function StoreProfile() {
  const { t } = useTranslation()
  const [toast, setToast] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopNameSaving, setShopNameSaving] = useState(false)
  const [shopNameToast, setShopNameToast] = useState('')
  const [form, setForm] = useState({
    description: t('page_store_profile.default_description'),
    url: 'ksshop.mystore.id', category: t('page_store_profile.default_category'),
    instagram: '@ksshop.id', tiktok: '@ksshop.live',
  })

  useEffect(() => {
    getStoreSettings().then((res) => setShopName(res.shop_name || ''))
  }, [])

  async function saveShopName(e) {
    e.preventDefault()
    setShopNameSaving(true)
    try {
      await updateStoreSettings(shopName)
      setShopNameToast(t('page_store_profile.shop_name_saved_toast'))
      setTimeout(() => setShopNameToast(''), 2500)
    } finally {
      setShopNameSaving(false)
    }
  }

  function save(e) {
    e.preventDefault()
    setToast(t('page_store_profile.toast_save_pending'))
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <form onSubmit={saveShopName} className="bg-white rounded-2xl shadow-sm p-5 space-y-3 mb-6">
        <h2 className="font-bold text-gray-800">{t('page_store_profile.shop_name_card_title')}</h2>
        <p className="text-xs text-gray-500">{t('page_store_profile.shop_name_card_hint')}</p>
        {shopNameToast && <div className="text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg">{shopNameToast}</div>}
        <div className="flex gap-2">
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={shopNameSaving || !shopName} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm shrink-0">
            {shopNameSaving ? t('page_order_detail.saving_button') : t('common.save')}
          </button>
        </div>
      </form>

      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        {t('shared.mock_preview_badge')}
      </span>
      {toast && <div className="mb-4 text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg">{toast}</div>}
      <form onSubmit={save} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">{t('page_store_profile.heading_profile')}</h2>
          <div className="flex gap-4 items-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">{t('page_store_profile.label_logo')}</div>
            <div className="flex-1 h-20 rounded-2xl bg-gradient-to-r from-brand-100 to-brand-50 flex items-center justify-center text-gray-400 text-xs">{t('page_store_profile.label_banner')}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_store_profile.label_description')}</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_store_profile.label_store_url')}</label>
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_store_profile.label_store_category')}</label>
              <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">{t('page_store_profile.heading_social_links')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_store_profile.label_instagram')}</label>
              <input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_store_profile.label_tiktok')}</label>
              <input value={form.tiktok} onChange={(e) => setForm((f) => ({ ...f, tiktok: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg">
          {t('common.save')}
        </button>
      </form>
    </div>
  )
}
