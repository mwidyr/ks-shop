import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPickupChains, createPickupChain, updatePickupChain, deletePickupChain } from '../api/pickupChains'
import { getShippingSettings, updateShippingSettings } from '../api/settings'
import { formatCurrency } from '../utils/format'

// Matches the reference's "Pengaturan Ongkir" layout: per-chain platform-fixed base fee
// (read-only) vs. the seller's own target fee charged to the buyer, with the margin
// ("Selisih Kamu") computed inline.
function PickupChainsCard({ chains, reload }) {
  const { t } = useTranslation()
  const [targetDrafts, setTargetDrafts] = useState({})
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  async function saveTarget(chain) {
    const value = Number(targetDrafts[chain.id])
    if (Number.isNaN(value)) return
    await updatePickupChain(chain.id, { name: chain.name, base_fee: chain.base_fee, target_fee: value, is_active: chain.is_active })
    reload()
  }

  async function toggleActive(chain) {
    await updatePickupChain(chain.id, { ...chain, is_active: !chain.is_active })
    reload()
  }

  async function handleDelete(chain) {
    setError('')
    try {
      await deletePickupChain(chain.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_shipping_settings.chains.delete_error'))
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setError('')
    try {
      await createPickupChain({ name: newName.trim(), base_fee: 0, target_fee: 0 })
      setNewName('')
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_shipping_settings.chains.add_error'))
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="font-bold text-gray-800 mb-1">{t('page_shipping_settings.chains.heading')}</h2>
      <p className="text-xs text-gray-500 mb-4">
        {t('page_shipping_settings.chains.description')}
      </p>
      <div className="space-y-3 mb-4">
        {chains.map((c) => {
          const target = targetDrafts[c.id] ?? c.target_fee
          const margin = Number(target) - Number(c.base_fee)
          return (
            <div key={c.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_active ? t('page_shipping_settings.chains.active') : t('page_shipping_settings.chains.inactive')}
                  </span>
                  <button onClick={() => toggleActive(c)} className="text-xs text-brand-600 hover:underline">
                    {c.is_active ? t('page_shipping_settings.chains.deactivate') : t('page_shipping_settings.chains.activate')}
                  </button>
                  <button onClick={() => handleDelete(c)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.chains.base_fee')}</label>
                  <p className="text-sm font-semibold text-gray-700 px-2 py-1.5">{formatCurrency(c.base_fee)}</p>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.chains.target_fee')}</label>
                  <input
                    type="number"
                    value={target}
                    onChange={(e) => setTargetDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    onBlur={() => saveTarget(c)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.chains.your_margin')}</label>
                  <p className={`text-sm font-bold px-2 py-1.5 ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(margin)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('page_shipping_settings.chains.new_method_placeholder')}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
          {t('common.add')}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

function FreeShippingCard() {
  const { t } = useTranslation()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { getShippingSettings().then(setForm) }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await updateShippingSettings({
        free_shipping_threshold_minimarket: Number(form.free_shipping_threshold_minimarket) || 0,
        free_shipping_threshold_pos: Number(form.free_shipping_threshold_pos) || 0,
        home_delivery_flat_fee: Number(form.home_delivery_flat_fee) || 0,
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
      <h2 className="font-bold text-gray-800 mb-1">{t('page_shipping_settings.free_shipping.heading')}</h2>
      <p className="text-xs text-gray-500 mb-4">{t('page_shipping_settings.free_shipping.description')}</p>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.free_shipping.threshold_minimarket')}</label>
          <input type="number" value={form.free_shipping_threshold_minimarket} onChange={(e) => update('free_shipping_threshold_minimarket', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.free_shipping.threshold_customer_address')}</label>
          <input type="number" value={form.free_shipping_threshold_pos} onChange={(e) => update('free_shipping_threshold_pos', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{t('page_shipping_settings.free_shipping.flat_fee_other')}</label>
          <input type="number" value={form.home_delivery_flat_fee} onChange={(e) => update('home_delivery_flat_fee', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? t('page_shipping_settings.free_shipping.saving') : t('common.save')}
          </button>
          {saved && <span className="text-xs text-green-600">{t('page_shipping_settings.free_shipping.saved')}</span>}
        </div>
      </form>
    </div>
  )
}

export default function ShippingSettings() {
  const [pickupChains, setPickupChains] = useState([])

  function reload() {
    listPickupChains(true).then(setPickupChains)
  }

  useEffect(reload, [])

  return (
    <div className="px-4 sm:px-6 py-6 grid md:grid-cols-2 gap-6 items-start">
      <PickupChainsCard chains={pickupChains} reload={reload} />
      <FreeShippingCard />
    </div>
  )
}
