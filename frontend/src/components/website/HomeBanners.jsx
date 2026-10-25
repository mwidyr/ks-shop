import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHomeBanners, saveHomeBanners } from '../../api/website'
import { resolveUrl, uploadImageFile } from '../../utils/image'
import { IconTrash } from '../icons'
import { btnCls, btnGhost, cardCls, inputCls } from './Pickers'

// Homepage banner carousel (#144): several banners, each one image (1600x600) with an optional link,
// shown in this order; saved together with its own button.
export const BANNER_SIZE = '1600 × 600'

export default function HomeBanners() {
  const { t } = useTranslation()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  useEffect(() => { getHomeBanners().then(setList).catch(() => setList([])) }, [])

  const set = (i, patch) => setList((cur) => cur.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const move = (i, d) => setList((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n })
  const remove = (i) => setList((cur) => cur.filter((_, j) => j !== i))

  async function pick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setMsg(null)
    try {
      for (const f of files) {
        const url = await uploadImageFile(f)
        setList((cur) => [...cur, { image_url: url, link_url: '', alt: '', is_active: true }])
      }
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || t('page_website.common.error') })
    } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      setList(await saveHomeBanners(list.map(({ image_url, link_url, alt, is_active }) => ({ image_url, link_url: link_url.trim(), alt, is_active }))))
      setMsg({ ok: true, text: t('page_website.banners.saved') })
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || t('page_website.common.error') })
    } finally { setBusy(false) }
  }

  if (!list) return null
  return (
    <div className={`${cardCls} space-y-3`} data-testid="home-banners">
      <div>
        <h2 className="font-bold text-gray-800">{t('page_website.banners.title')}</h2>
        <p className="text-xs text-gray-500">{t('page_website.banners.intro', { size: BANNER_SIZE })}</p>
      </div>
      {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      {list.length === 0 && <p className="text-sm text-gray-500">{t('page_website.banners.none')}</p>}
      {list.map((b, i) => (
        <div key={`${b.image_url}-${i}`} className="border border-gray-200 rounded-xl p-3 flex gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex sm:flex-col gap-1">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnGhost} aria-label={t('page_website.common.up')}>▲</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className={btnGhost} aria-label={t('page_website.common.down')}>▼</button>
          </div>
          <img src={resolveUrl(b.image_url)} alt={b.alt} className={`w-full sm:w-64 aspect-[8/3] object-cover rounded-lg bg-gray-100 ${b.is_active ? '' : 'opacity-40'}`} />
          <div className="flex-1 min-w-[200px] space-y-2">
            <div>
              <label className="text-xs text-gray-500">{t('page_website.banners.link')}</label>
              <input value={b.link_url} onChange={(e) => set(i, { link_url: e.target.value })} placeholder="/products?sort=newest  |  https://…" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('page_website.banners.alt')}</label>
              <input value={b.alt} onChange={(e) => set(i, { alt: e.target.value })} className={inputCls} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={b.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} className="w-4 h-4" />
                {t('page_website.banners.active')}
              </label>
              <button type="button" onClick={() => remove(i)} className="text-red-600 text-sm flex items-center gap-1 hover:underline" aria-label={t('page_website.banners.delete')}>
                <IconTrash className="w-4 h-4" /> {t('page_website.banners.delete')}
              </button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} data-testid="banner-file" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btnGhost}>+ {t('page_website.banners.add')}</button>
        <button type="button" onClick={save} disabled={busy} className={btnCls}>{busy ? t('page_website.common.saving') : t('page_website.banners.save')}</button>
      </div>
    </div>
  )
}
