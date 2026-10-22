import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStoreTutorial, saveStoreTutorial } from '../../api/website'
import { resolveUrl, uploadImageFile } from '../../utils/image'
import Toast, { useToast } from '../Toast'
import RichTextEditor from './RichTextEditor'
import { btnCls, btnGhost, cardCls } from './Pickers'

export const TUTORIAL_LANGS = ['id', 'en', 'zh']
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const IMAGE_MAX_BYTES = 3 * 1024 * 1024
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The editor reports { text, html }; html is empty while the text is plain, so plain text is wrapped in <p>.
export const tutorialHtml = ({ text, html }) => html || (String(text || '').trim() ? `<p>${esc(text).split('\n').join('<br>')}</p>` : '')

// Store Profile > Store-number tutorial: the instructions and the example picture of the checkout popup
// ("where is the store number on the receipt"), editable without a developer. Empty = built-in tutorial.
export default function TutorialCard() {
  const { t } = useTranslation()
  const tt = (k) => t(`page_website.tutorial.${k}`)
  const [data, setData] = useState(null)
  const [lang, setLang] = useState('id')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const { toast, showToast } = useToast()

  useEffect(() => { getStoreTutorial().then((r) => setData({ image_url: r.image_url || '', html: { id: '', en: '', zh: '', ...(r.html || {}) } })).catch(() => {}) }, [])
  if (!data) return null

  const setHtml = (l, v) => setData((cur) => ({ ...cur, html: { ...cur.html, [l]: tutorialHtml(v) } }))

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { setError(tt('bad_type')); return }
    if (file.size > IMAGE_MAX_BYTES) { setError(tt('too_big')); return }
    setBusy(true); setError('')
    try { setData((cur) => ({ ...cur, image_url: '' })); const url = await uploadImageFile(file); setData((cur) => ({ ...cur, image_url: url })) } catch (err) { setError(err.response?.data?.error || tt('failed')) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError('')
    try {
      const r = await saveStoreTutorial(data)
      setData({ image_url: r.image_url || '', html: { id: '', en: '', zh: '', ...(r.html || {}) } })
      showToast(tt('saved'))
    } catch (err) { setError(err.response?.data?.error || tt('failed')) } finally { setBusy(false) }
  }

  return (
    <div className={`${cardCls} space-y-4 mb-6`}>
      <Toast toast={toast} />
      <div>
        <h2 className="font-bold text-gray-800">{tt('title')}</h2>
        <p className="text-xs text-gray-500">{tt('intro')}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">{tt('image')}</label>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-40 h-28 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden" data-testid="tutorial-preview">
            {data.image_url ? <img src={resolveUrl(data.image_url)} alt={tt('image')} className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-gray-400 px-2 text-center">{tt('image_default')}</span>}
          </div>
          <div className="flex gap-2">
            <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} onChange={pick} className="hidden" data-testid="tutorial-file" />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btnCls}>{data.image_url ? tt('change') : tt('upload')}</button>
            {data.image_url && <button type="button" disabled={busy} onClick={() => setData((cur) => ({ ...cur, image_url: '' }))} className={btnGhost}>{tt('remove')}</button>}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1" role="tablist">
          {TUTORIAL_LANGS.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${lang === l ? 'bg-brand-600 text-white' : 'border border-gray-300 text-gray-600'}`}>{tt(`lang_${l}`)}</button>
          ))}
        </div>
        <RichTextEditor key={lang} mode="text" value={{ text: '', html: data.html[lang] }} onChange={(v) => setHtml(lang, v)} placeholder={tt('placeholder')} />
        <p className="text-xs text-gray-500">{tt('empty_hint')}</p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className={btnCls}>{busy ? t('page_website.common.saving') : t('page_website.common.save')}</button>
    </div>
  )
}
