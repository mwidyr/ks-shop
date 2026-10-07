import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getStoredSessionToken, verifyAccessCode, listPublicLocations, listPublicHosts,
  uploadPublicImage, recognizeLiveData, submitLiveData,
} from '../api/liveDataPublic'
import { resolveUrl } from '../utils/image'

function secondsToMMSS(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return ''
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function mmssToSeconds(text) {
  const match = /^(\d+):(\d{1,2})$/.exec((text || '').trim())
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

const emptyForm = {
  views: '', uv: '', active_viewers: '', awt_text: '', pcu: '', acu: '',
  follows: '', chats: '', shares: '', likes: '', live_duration_minutes: '',
}

// Public, no-login mobile wizard replacing the client's old Google Form - hosts pick
// Location + Host, upload 3 TikTok LIVE screenshots, review AI-recognized values, submit.
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

  const [slots, setSlots] = useState([null, null, null]) // {url, uploading, error}

  const [form, setForm] = useState(emptyForm)
  const [recognizing, setRecognizing] = useState(false)
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

  async function handlePickFile(idx, file) {
    if (!file) return
    setSlots((prev) => prev.map((s, i) => (i === idx ? { uploading: true } : s)))
    try {
      const url = await uploadPublicImage(file)
      setSlots((prev) => prev.map((s, i) => (i === idx ? { url } : s)))
    } catch (err) {
      if (handleUnauthorized(err)) return
      setSlots((prev) => prev.map((s, i) => (i === idx ? { error: t('page_live_data_upload.upload_failed') } : s)))
    }
  }

  const allUploaded = slots.every((s) => s?.url)
  const canProceedStep1 = hostId && locationId && allUploaded && !recognizing

  async function handleGoToReview() {
    setStepError('')
    setRecognizing(true)
    try {
      const result = await recognizeLiveData(slots.map((s) => s.url))
      setForm({
        views: result.views ?? '', uv: result.uv ?? '', active_viewers: result.active_viewers ?? '',
        awt_text: secondsToMMSS(result.awt_seconds), pcu: result.pcu ?? '', acu: result.acu ?? '',
        follows: result.follows ?? '', chats: result.chats ?? '', shares: result.shares ?? '', likes: result.likes ?? '',
        live_duration_minutes: result.live_duration_seconds != null ? Math.round(result.live_duration_seconds / 60) : '',
      })
      setStep(2)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setStepError(err.response?.data?.error || t('page_live_data_upload.recognize_failed'))
    } finally {
      setRecognizing(false)
    }
  }

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
        image_urls: slots.map((s) => s.url),
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
              setForm(emptyForm); setSlots([null, null, null]); setHostId(''); setLocationId('')
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
          <div className="grid grid-cols-3 gap-2 mb-4">
            {slots.map((slot, idx) => (
              <label key={idx} className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer bg-gray-50 relative">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handlePickFile(idx, e.target.files?.[0])} />
                {slot?.url ? (
                  <img src={resolveUrl(slot.url)} className="w-full h-full object-cover" />
                ) : slot?.uploading ? (
                  <span className="text-[10px] text-gray-400">{t('page_live_data_upload.uploading')}</span>
                ) : (
                  <span className="text-2xl text-gray-300">+</span>
                )}
                {slot?.error && <span className="absolute bottom-0 inset-x-0 text-[9px] text-red-600 bg-white/90 text-center">{slot.error}</span>}
              </label>
            ))}
          </div>
          {stepError && <p className="text-xs text-red-600 mb-2">{stepError}</p>}
          <button onClick={handleGoToReview} disabled={!canProceedStep1} className={primaryBtn}>
            {recognizing ? t('page_live_data_upload.recognizing') : t('page_live_data_upload.next_button')}
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
