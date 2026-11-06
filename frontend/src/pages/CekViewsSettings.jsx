import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchVoiceBlob, getAssignments, getPortalOverview, getVoiceSettings, saveAssignments, saveVoiceSettings, testVoice, uploadVoiceFile } from '../api/cekViews'
import { useCanEdit } from '../context/AccessContext'
import { cardClasses } from '../components/Table'
import { StatusBadge } from './TikTokAccounts'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'
const SHIFT_LABEL = { morning: 'Morning', middle: 'Middle', evening: 'Evening' }
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']]

// Live Assignment: which TikTok account each Host reports views for. Host and Shift come from Host Management;
// Room, Device and Status follow the chosen account.
function AssignmentTab({ canEdit }) {
  const { t } = useTranslation()
  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { getPortalOverview().then((l) => { setLocations(l); if (l[0]) setLocationId(String(l[0].id)) }).catch(() => {}) }, [])
  const load = (id) => getAssignments(id).then((d) => {
    setData(d)
    setDraft(Object.fromEntries(d.hosts.map((h) => [h.host_id, { account: h.tiktok_account_id ?? '', off: h.is_off }])))
  })
  useEffect(() => { if (locationId) { setMsg(''); load(locationId) } }, [locationId])

  const accountById = useMemo(() => Object.fromEntries((data?.accounts || []).map((a) => [a.id, a])), [data])
  const grouped = useMemo(() => {
    const groups = {}
    for (const h of data?.hosts || []) (groups[h.shift || ''] ||= []).push(h)
    return ['morning', 'middle', 'evening', ''].filter((k) => groups[k]).map((k) => [k, groups[k]])
  }, [data])
  const dirty = data && data.hosts.some((h) => String(draft[h.host_id]?.account ?? '') !== String(h.tiktok_account_id ?? '') || draft[h.host_id]?.off !== h.is_off)

  const setHost = (id, patch) => { setMsg(''); setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } })) }

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await saveAssignments(data.hosts.map((h) => ({ host_id: h.host_id, tiktok_account_id: draft[h.host_id].account === '' ? null : Number(draft[h.host_id].account), is_off: draft[h.host_id].off })))
      await load(locationId)
      setMsg(t('page_cek_views.saved'))
    } catch (err) {
      setMsg(err.response?.data?.error || t('page_cek_views.save_error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${cardClasses} p-4 flex flex-wrap items-end gap-3 justify-between`}>
        <div className="min-w-[12rem]">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('page_tiktok.location')}</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} w-full`}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-[var(--text-secondary)]">{msg}</span>}
          {canEdit && <button type="button" onClick={() => load(locationId)} disabled={!dirty} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">Reset</button>}
          {canEdit && <button type="button" onClick={save} disabled={busy || !dirty} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">{t('page_cek_views.save_changes')}</button>}
        </div>
        <p className="w-full text-xs text-[var(--text-secondary)]">{t('page_cek_views.assignment_hint')}</p>
      </div>

      {grouped.map(([shift, hosts]) => (
        <div key={shift || 'none'} className={`${cardClasses} overflow-x-auto`}>
          <div className="flex items-center justify-between px-4 pt-4"><h3 className="font-bold text-[var(--text-primary)]">{shift ? `${SHIFT_LABEL[shift]} Shift` : t('page_cek_views.no_shift')}</h3><span className="text-xs text-[var(--text-secondary)]">{hosts.length} Host</span></div>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
              <th className="p-3">Host</th><th className="p-3">TikTok Account</th><th className="p-3">{t('page_tiktok.room')}</th><th className="p-3">{t('page_tiktok.device')}</th><th className="p-3">{t('page_tiktok.status')}</th><th className="p-3">OFF</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--table-divider)]">
              {hosts.map((h) => {
                const d = draft[h.host_id] || { account: '', off: false }
                const acc = accountById[d.account]
                return (
                  <tr key={h.host_id} className={d.off ? 'opacity-50' : ''}>
                    <td className="p-3"><p className="font-semibold text-[var(--text-primary)]">{h.host_name}</p><p className="text-[11px] text-[var(--text-secondary)]">{t('page_cek_views.from_host_mgmt')}</p></td>
                    <td className="p-3">
                      <select value={d.account} disabled={!canEdit} onChange={(e) => setHost(h.host_id, { account: e.target.value })} className={`${inputCls} min-w-[10rem]`}>
                        <option value="">{t('page_tiktok.unassigned')}</option>
                        {data.accounts.map((a) => <option key={a.id} value={a.id}>@{a.tiktok_id}</option>)}
                      </select>
                    </td>
                    <td className="p-3">{acc?.room_name || '—'}</td>
                    <td className="p-3">{acc?.device_name || '—'}</td>
                    <td className="p-3">{acc ? <StatusBadge status={acc.status} /> : '—'}</td>
                    <td className="p-3"><input type="checkbox" checked={d.off} disabled={!canEdit} onChange={(e) => setHost(h.host_id, { off: e.target.checked })} className="h-4 w-4" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {data && data.hosts.length === 0 && <div className={`${cardClasses} p-6 text-center text-gray-400`}>{t('page_cek_views.no_hosts_location')}</div>}
    </div>
  )
}

// Voice Reminder: active days, one shared list of times, and the recording. Telegram group / topic come from Telegram Settings.
function VoiceTab({ canEdit }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState(null)
  const [days, setDays] = useState([])
  const [times, setTimes] = useState([])
  const [newTime, setNewTime] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [audioUrl, setAudioUrl] = useState('')
  const fileRef = useRef(null)

  const apply = (s) => { setSettings(s); setDays(s.days); setTimes(s.times) }
  useEffect(() => { getVoiceSettings().then(apply).catch(() => {}) }, [])
  useEffect(() => {
    if (!settings?.has_file) { setAudioUrl(''); return undefined }
    let url = ''
    fetchVoiceBlob().then((b) => { url = URL.createObjectURL(b); setAudioUrl(url) }).catch(() => setAudioUrl(''))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [settings?.has_file, settings?.updated_at])

  const dirty = settings && (JSON.stringify(days) !== JSON.stringify(settings.days) || JSON.stringify(times) !== JSON.stringify(settings.times))
  const toggleDay = (d) => { setMsg(''); setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b))) }
  function addTime() {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(newTime.trim())
    if (!m) { setMsg(t('page_cek_views.time_invalid')); return }
    const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`
    setTimes((cur) => [...new Set([...cur, hhmm])].sort())
    setNewTime('')
    setMsg('')
  }

  async function run(fn, okMsg) {
    setBusy(true)
    setMsg('')
    try { await fn(); if (okMsg) setMsg(okMsg) } catch (err) { setMsg(err.response?.data?.error || t('page_cek_views.save_error')) } finally { setBusy(false) }
  }

  if (!settings) return <div className={`${cardClasses} p-6 text-center text-gray-400`}>{t('common.loading')}</div>
  return (
    <div className={`${cardClasses} p-5 space-y-6 max-w-3xl`}>
      <div><h2 className="font-bold text-[var(--text-primary)]">Voice Reminder Settings</h2><p className="text-xs text-[var(--text-secondary)]">Telegram Bot · {settings.timezone}</p></div>

      <section className="space-y-2">
        <h3 className="font-semibold text-[var(--text-primary)]">Active Days</h3>
        <p className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.days_hint')}</p>
        <div className="grid grid-cols-7 gap-2">
          {DAYS.map(([d, label]) => (
            <button key={d} type="button" disabled={!canEdit} onClick={() => toggleDay(d)}
              className={`rounded-xl border py-3 text-sm font-semibold ${days.includes(d) ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
              {label}<span className="block text-lg leading-none mt-1">{days.includes(d) ? '✓' : '○'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between"><h3 className="font-semibold text-[var(--text-primary)]">Reminder Times</h3><span className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.n_times', { count: times.length })}</span></div>
        <p className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.times_hint')}</p>
        <div className="flex flex-wrap gap-2">
          {times.map((tm) => (
            <span key={tm} className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-mono">
              {tm}{canEdit && <button type="button" onClick={() => { setMsg(''); setTimes((cur) => cur.filter((x) => x !== tm)) }} className="text-gray-400 hover:text-red-600">×</button>}
            </span>
          ))}
          {times.length === 0 && <span className="text-sm text-gray-400">{t('page_cek_views.no_times')}</span>}
        </div>
        {canEdit && (
          <div className="flex gap-2 max-w-sm">
            <input value={newTime} onChange={(e) => setNewTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTime() } }} placeholder="HH:MM, e.g. 18:27" className={`${inputCls} flex-1 font-mono`} />
            <button type="button" onClick={addTime} className="border border-gray-300 text-sm font-semibold px-4 rounded-lg">+ {t('page_cek_views.add_time')}</button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-[var(--text-primary)]">Voice File</h3>
        {settings.has_file ? (
          <p className="text-sm text-[var(--text-secondary)]">{settings.filename} · {(settings.size_bytes / 1024).toFixed(0)} KB</p>
        ) : <p className="text-sm text-amber-700">{t('page_cek_views.no_voice')}</p>}
        {audioUrl && <audio controls src={audioUrl} className="w-full max-w-sm" />}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".ogg,.oga,.opus,.mp3,.m4a,audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) run(async () => { const r = await uploadVoiceFile(f); setSettings((s) => ({ ...s, has_file: r.has_file, filename: r.filename, size_bytes: r.size_bytes, updated_at: r.updated_at })) }, t('page_cek_views.voice_uploaded')) }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg">{settings.has_file ? t('page_cek_views.replace_voice') : t('page_cek_views.upload_voice')}</button>
            <button type="button" disabled={busy || !settings.has_file} onClick={() => window.confirm(t('page_cek_views.test_confirm')) && run(testVoice, t('page_cek_views.test_sent'))} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">{t('page_cek_views.send_test')}</button>
          </div>
        )}
        <p className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.voice_hint')}</p>
      </section>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-[var(--text-secondary)]">{msg}</span>}
        {canEdit && <button type="button" disabled={busy || !dirty} onClick={() => run(async () => apply({ ...(await saveVoiceSettings({ days, times })) }), t('page_cek_views.saved'))} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">{t('page_cek_views.save_changes')}</button>}
      </div>
    </div>
  )
}

export default function CekViewsSettings() {
  const { t } = useTranslation()
  const canEdit = useCanEdit()
  const [tab, setTab] = useState('assignment')
  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">CEK VIEWS — {t('page_cek_views.settings_title')}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t('page_cek_views.settings_subtitle')}</p>
      </div>
      <div className="flex gap-1 border-b border-[var(--table-divider)]">
        {[['assignment', 'Live Assignment'], ['voice', 'Voice Reminder']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}>{label}</button>
        ))}
      </div>
      {tab === 'assignment' ? <AssignmentTab canEdit={canEdit} /> : <VoiceTab canEdit={canEdit} />}
    </div>
  )
}
