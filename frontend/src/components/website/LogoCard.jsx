import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getThemeLogo, saveThemeLogo } from '../../api/website'
import { uploadImageFile } from '../../utils/image'
import Toast, { useToast } from '../Toast'
import PreviewableImage from '../PreviewableImage'
import { btnCls, btnGhost, cardCls } from './Pickers'

export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Website logo: upload, preview, remove. It is used by the website header right after saving
// (separate from the colour draft / publish flow). Without a logo the website shows its text wordmark.
export default function LogoCard({ onChange }) {
  const { t } = useTranslation()
  const lg = (k) => t(`page_website.theme.logo.${k}`)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const { toast, showToast } = useToast()

  useEffect(() => { getThemeLogo().then((r) => { setUrl(r.logo_url || ''); onChange?.(r.logo_url || '') }).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next, okText) {
    setBusy(true); setError('')
    try {
      const r = await saveThemeLogo(next)
      setUrl(r.logo_url || ''); onChange?.(r.logo_url || '')
      showToast(okText)
    } catch (e) {
      setError(e.response?.data?.error || lg('failed'))
    } finally {
      setBusy(false)
    }
  }
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) { setError(lg('bad_type')); return }
    if (file.size > LOGO_MAX_BYTES) { setError(lg('too_big')); return }
    setBusy(true); setError('')
    try {
      const uploaded = await uploadImageFile(file)
      await save(uploaded, lg('saved'))
    } catch (err) {
      setError(err.response?.data?.error || lg('failed'))
      setBusy(false)
    }
  }

  return (
    <div className={`${cardCls} space-y-3`}>
      <Toast toast={toast} />
      <div>
        <h2 className="font-bold text-gray-800">{lg('title')}</h2>
        <p className="text-sm text-gray-500">{lg('hint')}</p>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="h-16 min-w-[140px] rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center px-4" data-testid="logo-preview">
          {url ? <PreviewableImage url={url} alt={lg('alt')} className="max-h-12 max-w-[220px] object-contain" /> : <span className="text-xs text-gray-400">{lg('none')}</span>}
        </div>
        <div className="flex gap-2">
          <input ref={input} type="file" accept={LOGO_TYPES.join(',')} onChange={pick} className="hidden" data-testid="logo-file" />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btnCls}>{url ? lg('change') : lg('upload')}</button>
          {url && <button type="button" disabled={busy} onClick={() => save('', lg('removed'))} className={btnGhost}>{lg('remove')}</button>}
        </div>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}
