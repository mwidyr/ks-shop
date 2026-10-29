import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCategoryLayout, getHomeModules, saveHomeModules } from '../api/website'
import HomeAnnouncements from '../components/website/HomeAnnouncements'
import HomeBanners from '../components/website/HomeBanners'
import FeaturedCategoriesPicker from '../components/website/FeaturedCategoriesPicker'
import { btnCls, btnGhost, cardCls, inputCls } from '../components/website/Pickers'

const LANGS = ['id', 'en', 'zh']

export default function WebsiteHome() {
  const { t } = useTranslation()
  const [mods, setMods] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [cats, setCats] = useState([]) // for the featured-categories picker (needs the Categories Layout tab; empty otherwise)
  useEffect(() => { getHomeModules().then(setMods).catch(() => setMsg({ ok: false, text: t('page_website.common.error') })) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { getCategoryLayout().then((r) => setCats(r.categories || [])).catch(() => {}) }, [])

  const set = (i, patch) => setMods((cur) => cur.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const move = (i, d) => setMods((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n })

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await saveHomeModules(mods.map((m, i) => ({ key: m.key, enabled: m.enabled, position: i + 1, title: m.title, subtitle: m.subtitle, config: m.config })))
      setMsg({ ok: true, text: t('page_website.home.saved') })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') })
    } finally { setSaving(false) }
  }

  if (!mods) return <div className="p-6 text-gray-500">{t('page_website.common.loading')}</div>
  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800">{t('page_website.home.title')}</h1>
        <p className="text-sm text-gray-500">{t('page_website.home.intro')}</p>
      </div>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <HomeAnnouncements />
      <HomeBanners />
      {mods.map((m, i) => (
        <div key={m.key} className={`${cardCls} space-y-3`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnGhost} aria-label={t('page_website.common.up')}>▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === mods.length - 1} className={btnGhost} aria-label={t('page_website.common.down')}>▼</button>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-gray-800">{i + 1}. {t(`page_website.home.m_${m.key}`)}</div>
              <div className="text-xs text-gray-500">{t(`page_website.home.src_${m.key}`)}</div>
              <div className={`text-xs mt-1 ${m.count > 0 ? 'text-gray-500' : 'text-amber-700'}`}>{m.count > 0 ? t('page_website.home.items_now', { n: m.count }) : t('page_website.home.empty_warning')}</div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={m.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} className="w-5 h-5" />
              {t('page_website.home.enabled')}
            </label>
          </div>
          {m.enabled && (
            <div className="grid sm:grid-cols-3 gap-3">
              {LANGS.map((l) => (
                <div key={l}>
                  <label className="text-xs text-gray-500">{t('page_website.home.title_field')} ({t(`page_website.common.language_${l}`)})</label>
                  <input value={m.title?.[l] || ''} onChange={(e) => set(i, { title: { ...m.title, [l]: e.target.value } })} className={inputCls} />
                  <label className="text-xs text-gray-500 mt-2 block">{t('page_website.home.subtitle_field')} ({t(`page_website.common.language_${l}`)})</label>
                  <input value={m.subtitle?.[l] || ''} onChange={(e) => set(i, { subtitle: { ...m.subtitle, [l]: e.target.value } })} className={inputCls} />
                </div>
              ))}
              {'limit' in (m.config || {}) && (
                <div>
                  <label className="text-xs text-gray-500">{t('page_website.home.limit')}</label>
                  <input type="number" min="1" max="30" value={m.config.limit} onChange={(e) => set(i, { config: { ...m.config, limit: Number(e.target.value) } })} className={inputCls} />
                </div>
              )}
              {m.key === 'categories' && cats.length > 0 && (
                <div className="sm:col-span-3">
                  <FeaturedCategoriesPicker categories={cats} value={m.config?.category_ids || []} onChange={(ids) => set(i, { config: { ...m.config, category_ids: ids } })} />
                </div>
              )}
              {'days' in (m.config || {}) && (
                <div>
                  <label className="text-xs text-gray-500">{t('page_website.home.days')}</label>
                  <input type="number" min="1" max="90" value={m.config.days} onChange={(e) => set(i, { config: { ...m.config, days: Number(e.target.value) } })} className={inputCls} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="sticky bottom-0 bg-gray-50/90 py-3">
        <button type="button" onClick={save} disabled={saving} className={btnCls}>{saving ? t('page_website.common.saving') : t('page_website.common.publish')}</button>
      </div>
    </div>
  )
}
