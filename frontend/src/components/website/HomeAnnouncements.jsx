import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHomeAnnouncements, saveHomeAnnouncements } from '../../api/website'
import { IconTrash } from '../icons'
import { btnCls, btnGhost, cardCls, inputCls } from './Pickers'

// Announcement bar of the website homepage (WEB ADJ 035): kept apart from the Home Modules. Messages are added
// one by one (a text per language), shown on the website in this order, one after another; saved together.
const LANGS = [['id', 'text_id'], ['en', 'text_en'], ['zh', 'text_zh']]
const EMPTY = { text_id: '', text_en: '', text_zh: '' }

export default function HomeAnnouncements() {
  const { t } = useTranslation()
  const [list, setList] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => { getHomeAnnouncements().then(setList).catch(() => setList([])) }, [])

  const set = (i, patch) => setList((cur) => cur.map((a, j) => (j === i ? { ...a, ...patch } : a)))
  const move = (i, d) => setList((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n })
  const remove = (i) => setList((cur) => cur.filter((_, j) => j !== i))
  const draftOk = LANGS.some(([, k]) => draft[k].trim())

  function add(e) {
    e.preventDefault()
    if (!draftOk) return
    setList((cur) => [...cur, { ...draft, is_active: true }])
    setDraft(EMPTY)
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      setList(await saveHomeAnnouncements(list.map(({ text_id, text_en, text_zh, is_active }) => ({ text_id, text_en, text_zh, is_active }))))
      setMsg({ ok: true, text: t('page_website.announcements.saved') })
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || t('page_website.common.error') })
    } finally { setBusy(false) }
  }

  if (!list) return null
  return (
    <div className={`${cardCls} space-y-3`} data-testid="home-announcements">
      <div>
        <h2 className="font-bold text-gray-800">{t('page_website.announcements.title')}</h2>
        <p className="text-xs text-gray-500">{t('page_website.announcements.intro')}</p>
      </div>
      {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <form onSubmit={add} className="grid sm:grid-cols-3 gap-2 items-end">
        {LANGS.map(([code, key]) => (
          <div key={code}>
            <label className="text-xs text-gray-500">{t(`page_website.announcements.lang_${code}`)}</label>
            <input value={draft[key]} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} placeholder={t('page_website.announcements.placeholder')} className={inputCls} />
          </div>
        ))}
        <button type="submit" disabled={!draftOk} className={`${btnGhost} sm:col-span-3 justify-self-start`}>+ {t('page_website.announcements.add')}</button>
      </form>
      <div className="divide-y">
        {list.length === 0 && <p className="text-xs text-gray-400 py-2">{t('page_website.announcements.none')}</p>}
        {list.map((a, i) => (
          <div key={i} className="py-3 flex gap-3 flex-wrap sm:flex-nowrap" data-testid="announcement-row">
            <div className="flex sm:flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnGhost} aria-label={t('page_website.common.up')}>▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className={btnGhost} aria-label={t('page_website.common.down')}>▼</button>
            </div>
            <div className={`flex-1 min-w-[220px] grid sm:grid-cols-3 gap-2 ${a.is_active ? '' : 'opacity-50'}`}>
              {LANGS.map(([code, key]) => (
                <div key={code}>
                  <label className="text-xs text-gray-500">{t(`page_website.announcements.lang_${code}`)}</label>
                  <input value={a[key]} maxLength={200} onChange={(e) => set(i, { [key]: e.target.value })} className={inputCls} />
                </div>
              ))}
            </div>
            <div className="flex sm:flex-col items-start justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={a.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} className="w-4 h-4" />
                {t('page_website.announcements.active')}
              </label>
              <button type="button" onClick={() => remove(i)} className="text-red-600 text-sm flex items-center gap-1 hover:underline" aria-label={t('page_website.announcements.delete')}>
                <IconTrash className="w-4 h-4" /> {t('page_website.announcements.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={save} disabled={busy} className={btnCls}>{busy ? t('page_website.common.saving') : t('page_website.announcements.save')}</button>
    </div>
  )
}
