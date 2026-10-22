import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSiteSettings, saveSiteSettings } from '../../api/website'
import { btnCls, cardCls, inputCls } from './Pickers'

// Store Profile > Website & WhatsApp: the CS WhatsApp number (order hand-off), hours, socials.
export default function WebsiteSettingsCard() {
  const { t } = useTranslation()
  const s = (k, o) => t(`page_website.settings.${k}`, o)
  const [f, setF] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { getSiteSettings().then(setF).catch(() => {}) }, [])
  if (!f) return null
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }))
  async function save(e) {
    e.preventDefault(); setSaving(true); setMsg(null)
    try { setF(await saveSiteSettings(f)); setMsg({ ok: true, text: s('saved') }) } catch (err) { setMsg({ ok: false, text: err.response?.data?.error || t('page_website.common.error') }) } finally { setSaving(false) }
  }
  const digits = (f.whatsapp_number || '').replace(/\D/g, '')
  return (
    <form onSubmit={save} className={`${cardCls} space-y-3 mb-6`}>
      <h2 className="font-bold text-gray-800">{s('title')}</h2>
      <p className="text-xs text-gray-500">{s('intro')}</p>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <div>
        <label className="text-sm font-medium text-gray-700">{s('wa')}</label>
        <input value={f.whatsapp_number || ''} onChange={(e) => set('whatsapp_number', e.target.value)} className={inputCls} placeholder="0822-2005-6883" />
        <p className="text-xs text-gray-500 mt-1">{s('wa_hint')}</p>
        {digits && <p className="text-xs mt-1">{s('wa_link')}: <a className="text-brand-700 underline" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">wa.me/{digits}</a></p>}
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">{s('line')}</label>
        <input value={f.line_id || ''} onChange={(e) => set('line_id', e.target.value)} className={inputCls} placeholder="@ohlalashop888" />
        <p className="text-xs text-gray-500 mt-1">{s('line_hint')}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="text-sm font-medium text-gray-700">{s('hours')}</label><input value={f.cs_hours || ''} onChange={(e) => set('cs_hours', e.target.value)} className={inputCls} /></div>
        <div><label className="text-sm font-medium text-gray-700">{s('hours_note')}</label><input value={f.cs_hours_note || ''} onChange={(e) => set('cs_hours_note', e.target.value)} className={inputCls} /></div>
        {[['social_youtube', 'yt'], ['social_instagram', 'ig'], ['social_facebook', 'fb'], ['social_tiktok', 'tt']].map(([k, l]) => (
          <div key={k}><label className="text-sm font-medium text-gray-700">{s(l)}</label><input value={f[k] || ''} onChange={(e) => set(k, e.target.value)} className={inputCls} placeholder="https://" /></div>
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <b className="text-sm text-gray-800">{s('free_ship')}</b>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.free_shipping_active !== 'false'} onChange={(e) => set('free_shipping_active', e.target.checked ? 'true' : 'false')} />{s('free_ship_on')}</label>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{s('free_from')}</label><input type="date" value={f.free_shipping_start || ''} onChange={(e) => set('free_shipping_start', e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs text-gray-500">{s('free_to')}</label><input type="date" value={f.free_shipping_end || ''} onChange={(e) => set('free_shipping_end', e.target.value)} className={inputCls} /></div>
        </div>
      </div>
      <button type="submit" disabled={saving} className={btnCls}>{saving ? t('page_website.common.saving') : t('page_website.common.save')}</button>
    </form>
  )
}
