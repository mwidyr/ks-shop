import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCategoryLayout, saveCategoryLayout, setCategoryCover } from '../api/website'
import { useMasterData } from '../context/MasterDataContext'
import { resolveUrl, uploadImageFile } from '../utils/image'
import { IconPlus, IconTrash } from '../components/icons'
import { btnCls, btnGhost, cardCls } from '../components/website/Pickers'

// Category page layout (#146): sections of five cards in one of three mosaic templates.
export const TEMPLATES = ['large_left', 'large_right', 'all_small']
const SLOTS = 5

// Grid cell of each slot on a 4-column grid (the same geometry the website uses on desktop).
export function slotPlacement(template, slot) {
  if (template === 'all_small') return { gridColumn: `${(slot % 4) + 1}`, gridRow: `${Math.floor(slot / 4) + 1}` }
  const bigCol = template === 'large_left' ? 1 : 3
  const smallCol = template === 'large_left' ? 3 : 1
  if (slot === 0) return { gridColumn: `${bigCol} / span 2`, gridRow: '1 / span 2' }
  const k = slot - 1
  return { gridColumn: `${smallCol + (k % 2)}`, gridRow: `${Math.floor(k / 2) + 1}` }
}

function Preview({ template, slots, cats }) {
  const { translateCategory } = useMasterData()
  const rows = template === 'all_small' ? 2 : 2
  return (
    <div className="grid grid-cols-4 gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-2" style={{ gridTemplateRows: `repeat(${rows}, 4.5rem)` }} data-testid="layout-preview">
      {Array.from({ length: SLOTS }, (_, i) => {
        const c = slots[i] != null ? cats.get(slots[i]) : null
        return (
          <div key={i} style={slotPlacement(template, i)} className={`relative rounded-lg overflow-hidden flex items-center justify-center text-xs ${c ? 'bg-gray-200' : 'border border-dashed border-gray-300 text-gray-400'}`}>
            {c ? (
              <>
                {c.cover_url && <img src={resolveUrl(c.cover_url)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <span className="relative bg-black/50 text-white px-1.5 py-0.5 rounded truncate max-w-full">{translateCategory(c.name)}</span>
              </>
            ) : <IconPlus className="w-4 h-4" />}
          </div>
        )
      })}
    </div>
  )
}

export default function WebsiteCategories() {
  const { t } = useTranslation()
  const { translateCategory } = useMasterData()
  const [sections, setSections] = useState(null)
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  const coverFor = useRef(null)
  useEffect(() => {
    getCategoryLayout().then((r) => { setSections(r.sections || []); setCats(r.categories || []) }).catch(() => { setSections([]); setMsg({ ok: false, text: t('page_website.common.error') }) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byID = new Map(cats.map((c) => [c.id, c]))
  const setSection = (i, patch) => setSections((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const setSlot = (i, slot, v) => setSections((cur) => cur.map((s, j) => (j === i ? { ...s, slots: s.slots.map((x, k) => (k === slot ? v : x)) } : s)))
  const move = (i, d) => setSections((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n })
  const add = () => setSections((cur) => [...cur, { template: 'large_left', slots: Array(SLOTS).fill(null) }])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await saveCategoryLayout(sections)
      setSections(r.sections); setCats(r.categories)
      setMsg({ ok: true, text: t('page_website.categories_layout.saved') })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') })
    } finally { setBusy(false) }
  }

  async function uploadCover(e) {
    const file = e.target.files?.[0]
    const id = coverFor.current
    e.target.value = ''
    if (!file || !id) return
    setMsg(null)
    try {
      const url = await uploadImageFile(file)
      await setCategoryCover(id, url)
      setCats((cur) => cur.map((c) => (c.id === id ? { ...c, cover_url: url } : c)))
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || t('page_website.common.error') })
    }
  }

  if (!sections) return <div className="p-6 text-gray-500">{t('page_website.common.loading')}</div>
  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800">{t('page_website.categories_layout.title')}</h1>
        <p className="text-sm text-gray-500">{t('page_website.categories_layout.intro')}</p>
      </div>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadCover} data-testid="cover-file" />
      {sections.length === 0 && <div className={`${cardCls} text-sm text-gray-500`}>{t('page_website.categories_layout.none')}</div>}
      {sections.map((s, i) => (
        <div key={i} className={`${cardCls} space-y-3`} data-testid="layout-section">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnGhost} aria-label={t('page_website.common.up')}>▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className={btnGhost} aria-label={t('page_website.common.down')}>▼</button>
            </div>
            <div className="font-bold text-gray-800 flex-1">{t('page_website.categories_layout.section', { n: i + 1 })}</div>
            <button type="button" onClick={() => setSections((cur) => cur.filter((_, j) => j !== i))} className="text-red-600 text-sm flex items-center gap-1 hover:underline">
              <IconTrash className="w-4 h-4" /> {t('page_website.categories_layout.delete')}
            </button>
          </div>
          <div className="flex gap-1 flex-wrap" role="tablist">
            {TEMPLATES.map((tp) => (
              <button key={tp} type="button" role="tab" aria-selected={s.template === tp} onClick={() => setSection(i, { template: tp })}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${s.template === tp ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {t(`page_website.categories_layout.tpl_${tp}`)}
              </button>
            ))}
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{t('page_website.categories_layout.preview')}</div>
            <Preview template={s.template} slots={s.slots} cats={byID} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {s.slots.map((cid, slot) => (
              <div key={slot}>
                <label className="text-xs text-gray-500">
                  {t('page_website.categories_layout.slot', { n: slot + 1 })}{slot === 0 && s.template !== 'all_small' ? ` · ${t('page_website.categories_layout.large')}` : ''}
                </label>
                <div className="flex gap-2">
                  <select value={cid ?? ''} onChange={(e) => setSlot(i, slot, e.target.value === '' ? null : Number(e.target.value))} className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">{t('page_website.categories_layout.empty')}</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{translateCategory(c.name)}{c.count === 0 ? ` (${t('page_website.categories_layout.no_products')})` : ''}</option>)}
                  </select>
                  {cid != null && (
                    <button type="button" className={btnGhost} onClick={() => { coverFor.current = cid; fileRef.current?.click() }}>
                      {byID.get(cid)?.cover_url ? t('page_website.categories_layout.replace_image') : t('page_website.categories_layout.upload_image')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="sticky bottom-0 bg-gray-50/90 py-3 flex gap-2">
        <button type="button" onClick={add} className={btnGhost}>+ {t('page_website.categories_layout.add_section')}</button>
        <button type="button" onClick={save} disabled={busy} className={btnCls}>{busy ? t('page_website.common.saving') : t('page_website.common.publish')}</button>
      </div>
    </div>
  )
}
