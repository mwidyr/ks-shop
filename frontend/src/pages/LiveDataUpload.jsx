import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getStoredSessionToken, verifyAccessCode, listPublicLocations, listPublicHosts,
  uploadPublicImage, recognizeLiveData, submitLiveData,
} from '../api/liveDataPublic'
import AttachmentThumb from '../components/AttachmentThumb'
import ImagePreviewModal from '../components/ImagePreviewModal'
import { MAX_SCREENSHOTS, analyzeScreenshots, mmssToSeconds, secondsToMMSS } from '../utils/liveData'

const emptyForm = {
  views: '', uv: '', active_viewers: '', awt_text: '', pcu: '', acu: '',
  follows: '', chats: '', shares: '', likes: '', live_duration_minutes: '',
}

// Public, no-login mobile wizard replacing the client's old Google Form - hosts pick
// Location + Host, upload the 2 TikTok LIVE screenshots (Penonton + Engagement) together in any order - the
// server reads each one and says which tab it is, then the page moves on by itself - review the values, submit.
// Step 0 (code gate) is skipped on return visits if a still-stored session token exists; if a
// later call 401s because that token expired, we bounce back here rather than anywhere else.
export default function LiveDataUpload() {
  const { t } = useTranslation()
  const [step, setStep] = useState(getStoredSessionToken() ? 1 : 0)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [locationId, setLocationId] = useState('')
  const [hostId, setHostId] = useState('')

  const [images, setImages] = useState([]) // {id, url, status: uploading | reading | done | error, data, error}
  const nextId = useRef(1)
  const filledFor = useRef('') // which set of screenshots the review form was last filled from
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  const [form, setForm] = useState(emptyForm)
  const [recognizedRaw, setRecognizedRaw] = useState(null)
  const [stepError, setStepError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => { listPublicLocations().then(setLocations) }, [])
  useEffect(() => {
    setHostId('')
    listPublicHosts(locationId || undefined).then(setHosts)
  }, [locationId])

  function handleUnauthorized(err) {
    if (err?.response?.status === 401) {
      setStep(0)
      setCodeError(t('page_live_data_upload.session_expired'))
      return true
    }
    return false
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setVerifying(true)
    setCodeError('')
    try {
      await verifyAccessCode(code.trim())
      setCode('')
      setStep(1)
    } catch (err) {
      setCodeError(err.response?.data?.error || t('page_live_data_upload.code_invalid'))
    } finally {
      setVerifying(false)
    }
  }

  const patchImage = (id, patch) => setImages((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  // Several files at once (gallery multi-select / drag & drop): upload each, then let the server read it.
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    setStepError('')
    const room = MAX_SCREENSHOTS - images.length
    if (files.length > room) setStepError(t('page_live_data_upload.too_many', { max: MAX_SCREENSHOTS }))
    await Promise.all(files.slice(0, Math.max(room, 0)).map(async (file) => {
      const id = nextId.current++
      setImages((list) => [...list, { id, status: 'uploading' }])
      try {
        const url = await uploadPublicImage(file)
        patchImage(id, { url, status: 'reading' })
        try {
          const res = await recognizeLiveData([url])
          patchImage(id, { status: 'done', data: res.images?.[0]?.data || null })
        } catch (err) {
          if (handleUnauthorized(err)) return
          patchImage(id, { status: 'done', data: null }) // the AI could not read it: the host can still type the numbers
        }
      } catch (err) {
        if (handleUnauthorized(err)) return
        patchImage(id, { status: 'error', error: t('page_live_data_upload.upload_failed') })
      }
    }))
  }

  const removeImage = (id) => { setImages((list) => list.filter((i) => i.id !== id)); setStepError('') }

  const analysis = useMemo(() => analyzeScreenshots(images), [images])
  const hasError = images.some((i) => i.status === 'error')
  const canProceedStep1 = hostId && locationId && (analysis.ready || analysis.manual) && !hasError
  const signature = analysis.saveUrls.join('|')

  function goToReview() {
    setStepError('')
    if (filledFor.current !== signature) {
      filledFor.current = signature
      const m = analysis.merged
      setRecognizedRaw(images.map((i) => ({ url: i.url, data: i.data || null })))
      setForm({
        views: m.views ?? '', uv: m.uv ?? '', active_viewers: m.active_viewers ?? '',
        awt_text: secondsToMMSS(m.awt_seconds), pcu: m.pcu ?? '', acu: m.acu ?? '',
        follows: m.follows ?? '', chats: m.chats ?? '', shares: m.shares ?? '', likes: m.likes ?? '',
        live_duration_minutes: m.live_duration_seconds != null ? Math.round(m.live_duration_seconds / 60) : '',
      })
    }
    setStep(2)
  }

  // Both screenshots recognised and Location + Host chosen: go straight to the review (once per set of screenshots)
  useEffect(() => {
    if (step === 1 && analysis.ready && hostId && locationId && filledFor.current !== signature) goToReview()
  }) // eslint-disable-line react-hooks/exhaustive-deps

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setStepError('')
    try {
      await submitLiveData({
        host_id: Number(hostId),
        location_id: Number(locationId),
        views: Number(form.views) || 0,
        uv: Number(form.uv) || 0,
        active_viewers: Number(form.active_viewers) || 0,
        awt_seconds: mmssToSeconds(form.awt_text),
        pcu: Number(form.pcu) || 0,
        acu: Number(form.acu) || 0,
        follows: Number(form.follows) || 0,
        chats: Number(form.chats) || 0,
        shares: Number(form.shares) || 0,
        likes: Number(form.likes) || 0,
        live_duration_seconds: (Number(form.live_duration_minutes) || 0) * 60,
        image_urls: analysis.saveUrls,
        recognized_data: recognizedRaw,
      })
      setSubmitted(true)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setStepError(err.response?.data?.error || t('page_live_data_upload.submit_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const locationName = locations.find((l) => String(l.id) === String(locationId))?.name || ''
  const hostName = hosts.find((h) => String(h.id) === String(hostId))?.name || ''

  const card = 'bg-white rounded-2xl shadow-sm p-5 max-w-md mx-auto'
  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
  const label = 'block text-[11px] text-gray-500 mb-1'
  const primaryBtn = 'w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50'

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className={card}>
          <h1 className="text-lg font-bold text-gray-800 mb-2">{t('page_live_data_upload.success_title')}</h1>
          <p className="text-sm text-gray-500 mb-4">{t('page_live_data_upload.success_desc')}</p>
          <button
            className={primaryBtn}
            onClick={() => {
              setForm(emptyForm); setImages([]); filledFor.current = ''; setHostId(''); setLocationId('')
              setSubmitted(false); setStep(1)
            }}
          >
            {t('page_live_data_upload.submit_another')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <h1 className="text-center text-lg font-bold text-gray-800 mb-5">{t('page_live_data_upload.title')}</h1>

      {step === 0 && (
        <form onSubmit={handleVerifyCode} className={card}>
          <h2 className="font-semibold text-gray-800 mb-1">{t('page_live_data_upload.code_title')}</h2>
          <p className="text-xs text-gray-500 mb-3">{t('page_live_data_upload.code_desc')}</p>
          <label className={label}>{t('page_live_data_upload.code_label')}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={input} autoFocus required />
          {codeError && <p className="text-xs text-red-600 mt-2">{codeError}</p>}
          <button type="submit" disabled={verifying || !code} className={`${primaryBtn} mt-4`}>
            {verifying ? t('page_live_data_upload.verifying') : t('page_live_data_upload.code_submit')}
          </button>
        </form>
      )}

      {step === 1 && (
        <div className={card}>
          <h2 className="font-semibold text-gray-800 mb-3">{t('page_live_data_upload.step1_title')}</h2>
          <label className={label}>{t('page_live_data_upload.location_label')}</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${input} mb-3`}>
            <option value="">{t('page_live_data_upload.choose_option')}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className={label}>{t('page_live_data_upload.host_label')}</label>
          <select value={hostId} onChange={(e) => setHostId(e.target.value)} className={`${input} mb-4`} disabled={!locationId}>
            <option value="">{t('page_live_data_upload.choose_option')}</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>

          <label className={label}>{t('page_live_data_upload.screenshots_label')}</label>
          <p className="text-[11px] text-gray-500 mb-2">{t('page_live_data_upload.screenshots_hint')}</p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg py-5 cursor-pointer text-center ${dragOver ? 'border-brand-600 bg-brand-50' : 'border-gray-300 bg-gray-50'} ${images.length >= MAX_SCREENSHOTS ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
            <span className="text-2xl text-gray-300">+</span>
            <span className="text-xs font-semibold text-gray-600">{t('page_live_data_upload.pick_screenshots')}</span>
          </label>

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3 mb-3">
              {images.map((img) => {
                const bad = analysis.problems.find((p) => p.urls.includes(img.url))
                const tab = img.data?.tab
                return (
                  <div key={img.id} className="text-center">
                    {img.url ? (
                      <AttachmentThumb url={img.url} className="w-full aspect-[3/4]" onPreview={() => setPreviewUrl(img.url)}
                        onDelete={() => removeImage(img.id)} deleteLabel={t('page_live_data_upload.remove_screenshot')} />
                    ) : (
                      <div className="relative w-full aspect-[3/4] rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center">
                        <span className="text-[11px] text-gray-400">{img.status === 'error' ? img.error : t('page_live_data_upload.uploading')}</span>
                        {img.status === 'error' && (
                          <button type="button" onClick={() => removeImage(img.id)} aria-label={t('page_live_data_upload.remove_screenshot')}
                            className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-900/80 text-white text-sm">×</button>
                        )}
                      </div>
                    )}
                    <p className={`text-[11px] mt-1 font-semibold ${bad || img.status === 'error' ? 'text-red-600' : img.status === 'done' && tab && tab !== 'other' ? 'text-green-600' : 'text-gray-400'}`}>
                      {img.status === 'reading' && t('page_live_data_upload.recognizing')}
                      {img.status === 'done' && (tab === 'penonton' || tab === 'engagement') && `✓ ${t(`page_live_data_upload.tab_${tab}`)}`}
                      {img.status === 'done' && tab === 'other' && t('page_live_data_upload.tab_other')}
                      {img.status === 'done' && !img.data && t('page_live_data_upload.read_failed_short')}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
          {analysis.problems.map((p) => (
            <p key={p.code} className="text-xs text-red-600 mb-2">{t(`page_live_data_upload.problem_${p.code}`)}</p>
          ))}
          {analysis.missing.map((m) => (
            <p key={m} className="text-xs text-amber-700 mb-2">{t('page_live_data_upload.missing_tab', { tab: t(`page_live_data_upload.tab_${m}`) })}</p>
          ))}
          {analysis.manual && <p className="text-xs text-amber-700 mb-2">{t('page_live_data_upload.recognize_failed')}</p>}
          {images.length === 1 && analysis.missing.length === 0 && !analysis.busy && <p className="text-xs text-gray-500 mb-2">{t('page_live_data_upload.need_two')}</p>}
          {previewUrl && <ImagePreviewModal images={[{ url: previewUrl }]} onClose={() => setPreviewUrl(null)} />}
          {stepError && <p className="text-xs text-red-600 mb-2">{stepError}</p>}
          <button onClick={goToReview} disabled={!canProceedStep1} className={`${primaryBtn} mt-2`}>
            {analysis.busy ? t('page_live_data_upload.recognizing') : t('page_live_data_upload.next_button')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={card}>
          <h2 className="font-semibold text-gray-800 mb-3">{t('page_live_data_upload.step2_title')}</h2>

          <h3 className="text-xs font-bold uppercase text-gray-400 mb-2">{t('page_live_data_upload.group_viewer')}</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={label}>{t('page_live_data_upload.field_views')}</label>
              <input type="number" value={form.views} onChange={(e) => updateForm('views', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_uv')}</label>
              <input type="number" value={form.uv} onChange={(e) => updateForm('uv', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_active')}</label>
              <input type="number" value={form.active_viewers} onChange={(e) => updateForm('active_viewers', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_awt')}</label>
              <input value={form.awt_text} onChange={(e) => updateForm('awt_text', e.target.value)} placeholder="1:06" className={input} />
              <p className="text-[10px] text-gray-400 mt-0.5">{t('page_live_data_upload.awt_hint')}</p>
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_pcu')}</label>
              <input type="number" value={form.pcu} onChange={(e) => updateForm('pcu', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_acu')}</label>
              <input type="number" value={form.acu} onChange={(e) => updateForm('acu', e.target.value)} className={input} />
            </div>
          </div>

          <h3 className="text-xs font-bold uppercase text-gray-400 mb-2">{t('page_live_data_upload.group_engagement')}</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={label}>{t('page_live_data_upload.field_follows')}</label>
              <input type="number" value={form.follows} onChange={(e) => updateForm('follows', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_chats')}</label>
              <input type="number" value={form.chats} onChange={(e) => updateForm('chats', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_shares')}</label>
              <input type="number" value={form.shares} onChange={(e) => updateForm('shares', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{t('page_live_data_upload.field_likes')}</label>
              <input type="number" value={form.likes} onChange={(e) => updateForm('likes', e.target.value)} className={input} />
            </div>
          </div>

          <label className={label}>{t('page_live_data_upload.field_duration')}</label>
          <input type="number" value={form.live_duration_minutes} onChange={(e) => updateForm('live_duration_minutes', e.target.value)} className={`${input} mb-4`} />

          {stepError && <p className="text-xs text-red-600 mb-2">{stepError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 border border-gray-300 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-lg">
              {t('page_live_data_upload.back_button')}
            </button>
            <button onClick={() => setStep(3)} className={`flex-1 ${primaryBtn}`}>{t('page_live_data_upload.next_button')}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={card}>
          <h2 className="font-semibold text-gray-800 mb-3">{t('page_live_data_upload.step3_title')}</h2>
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
            <p><span className="text-gray-500">{t('page_live_data_upload.location_label')}: </span>{locationName}</p>
            <p><span className="text-gray-500">{t('page_live_data_upload.host_label')}: </span>{hostName}</p>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            {t('page_live_data_upload.confirm_reminder')}
          </p>
          {stepError && <p className="text-xs text-red-600 mb-2">{stepError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} disabled={submitting} className="flex-1 border border-gray-300 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50">
              {t('page_live_data_upload.back_button')}
            </button>
            <button onClick={handleSubmit} disabled={submitting} className={`flex-1 ${primaryBtn}`}>
              {submitting ? t('page_live_data_upload.submitting') : t('page_live_data_upload.submit_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
