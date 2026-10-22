import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { endLive, getLiveSettings, saveLiveLocation, saveLiveShift, saveLiveUrl } from '../api/website'
import Toast, { useToast } from '../components/Toast'
import { btnCls, btnGhost, cardCls, inputCls } from '../components/website/Pickers'
import { formatTaipei, rangesValid } from '../utils/liveTime'

const SHIFT_LABEL = { morning: 'shift_morning', middle: 'shift_middle', evening: 'shift_evening' }
const STATUS_CLS = { live: 'bg-red-100 text-red-700', scheduled: 'bg-amber-100 text-amber-700', offline: 'bg-gray-100 text-gray-500' }
export const REFRESH_MS = 60000

// Global LIVE Settings: one place for the default shift hours, each location's working days and every
// host's LIVE link. Host name, location and shift come from Host Management; status follows the schedule.
export default function WebsiteLive() {
  const { t } = useTranslation()
  const l = (k, o) => t(`page_website.live.${k}`, o)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  const load = useCallback(() => getLiveSettings().then((d) => { setData(d); setError('') }).catch(() => setError(l('load_failed'))), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); const id = setInterval(load, REFRESH_MS); return () => clearInterval(id) }, [load])

  if (!data) return <div className="px-4 sm:px-6 py-6 text-sm text-gray-500">{error || t('page_website.common.loading')}</div>
  return (
    <div className="px-4 sm:px-6 py-6 space-y-4 max-w-5xl">
      <Toast toast={toast} />
      <div>
        <h1 className="text-lg font-bold text-gray-800">{l('title')}</h1>
        <p className="text-sm text-gray-500">{l('intro')}</p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <Shifts shifts={data.shifts} l={l} t={t} onSaved={() => { showToast(l('saved')); load() }} onError={setError} />
      <Locations locations={data.locations} l={l} onSaved={() => { showToast(l('saved')); load() }} onError={setError} />
      <Hosts hosts={data.hosts} l={l} t={t} onChanged={(text) => { if (text) showToast(text); load() }} onError={setError} />
    </div>
  )
}

function Shifts({ shifts, l, t, onSaved, onError }) {
  return (
    <section className={`${cardCls} space-y-3`}>
      <div>
        <h2 className="font-bold text-gray-800">{l('shifts_title')}</h2>
        <p className="text-sm text-gray-500">{l('shifts_hint')}</p>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {shifts.map((s) => <ShiftCard key={s.shift} s={s} l={l} t={t} onSaved={onSaved} onError={onError} />)}
      </div>
    </section>
  )
}

function ShiftCard({ s, l, t, onSaved, onError }) {
  const [ranges, setRanges] = useState(s.ranges)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRanges(s.ranges) }, [s.ranges])
  const upd = (i, j, v) => setRanges((cur) => cur.map((r, k) => (k === i ? r.map((x, m) => (m === j ? v : x)) : r)))
  const valid = rangesValid(ranges)
  async function save() {
    setBusy(true); onError('')
    try { await saveLiveShift(s.shift, ranges); onSaved() } catch (e) { onError(e.response?.data?.error || l('save_failed')) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2" data-testid={`shift-${s.shift}`}>
      <p className="font-semibold text-gray-800">{t(`page_hosts.${SHIFT_LABEL[s.shift]}`)}</p>
      {ranges.length === 0 && <p className="text-xs text-gray-400">{l('shift_empty')}</p>}
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="time" value={r[0]} onChange={(e) => upd(i, 0, e.target.value)} className={inputCls} aria-label={l('from')} />
          <span className="text-gray-400">–</span>
          <input type="time" value={r[1]} onChange={(e) => upd(i, 1, e.target.value)} className={inputCls} aria-label={l('to')} />
          <button type="button" onClick={() => setRanges((cur) => cur.filter((_, k) => k !== i))} className={btnGhost} aria-label={l('remove')}>×</button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setRanges((cur) => [...cur, ['09:00', '10:00']])} className={btnGhost}>{l('add_range')}</button>
        <button type="button" disabled={busy || !valid} onClick={save} className={btnCls}>{l('save_default')}</button>
      </div>
    </div>
  )
}

function Locations({ locations, l, onSaved, onError }) {
  return (
    <section className={`${cardCls} space-y-3`}>
      <div>
        <h2 className="font-bold text-gray-800">{l('locations_title')}</h2>
        <p className="text-sm text-gray-500">{l('locations_hint')}</p>
      </div>
      <div className="space-y-3">
        {locations.map((loc) => <LocationRow key={loc.id} loc={loc} l={l} onSaved={onSaved} onError={onError} />)}
      </div>
    </section>
  )
}

function LocationRow({ loc, l, onSaved, onError }) {
  const [days, setDays] = useState(loc.work_days)
  const [off, setOff] = useState(loc.days_off)
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDays(loc.work_days); setOff(loc.days_off) }, [loc])
  const toggle = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))
  async function save() {
    setBusy(true); onError('')
    try { await saveLiveLocation(loc.id, { work_days: days, days_off: off }); onSaved() } catch (e) { onError(e.response?.data?.error || l('save_failed')) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2" data-testid={`loc-${loc.id}`}>
      <p className="font-semibold text-gray-800">{loc.name}</p>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <label key={d} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm cursor-pointer ${days.includes(d) ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-300 text-gray-600'}`}>
            <input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} className="accent-brand-600" />{l(`day_${d}`)}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">{l('days_off')}</p>
        {off.map((d) => (
          <div key={d.date} className="flex items-center gap-2 text-sm">
            <span className="tabular-nums">{d.date}</span>
            <input value={d.note} onChange={(e) => setOff((cur) => cur.map((x) => (x.date === d.date ? { ...x, note: e.target.value } : x)))} placeholder={l('note')} className={`${inputCls} max-w-xs`} />
            <button type="button" onClick={() => setOff((cur) => cur.filter((x) => x.date !== d.date))} className={btnGhost} aria-label={l('remove')}>×</button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label={l('add_day_off')} />
          <button type="button" disabled={!date || off.some((x) => x.date === date)} onClick={() => { setOff((cur) => [...cur, { date, note: '' }].sort((a, b) => a.date.localeCompare(b.date))); setDate('') }} className={btnGhost}>{l('add_day_off')}</button>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={save} className={btnCls}>{l('save')}</button>
    </div>
  )
}

function Hosts({ hosts, l, t, onChanged, onError }) {
  return (
    <section className={`${cardCls} space-y-3`}>
      <div>
        <h2 className="font-bold text-gray-800">{l('hosts_title')}</h2>
        <p className="text-sm text-gray-500">{l('hosts_hint')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-2 pr-3">{l('col_host')}</th><th className="pr-3">{l('col_location')}</th><th className="pr-3">{l('col_shift')}</th>
              <th className="pr-3 min-w-[320px]">{l('col_url')}</th><th>{l('col_status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {hosts.map((h) => <HostRow key={h.id} h={h} l={l} t={t} onChanged={onChanged} onError={onError} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HostRow({ h, l, t, onChanged, onError }) {
  const [url, setUrl] = useState(h.live_url)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setUrl(h.live_url) }, [h.live_url])
  async function saveUrl() {
    if (url.trim() === (h.live_url || '')) return
    setBusy(true); onError('')
    try { await saveLiveUrl(h.id, url.trim()); onChanged(l('url_saved')) } catch (e) { onError(e.response?.data?.error || l('save_failed')) } finally { setBusy(false) }
  }
  async function end() {
    if (!window.confirm(l('end_confirm', { name: h.name }))) return
    setBusy(true); onError('')
    try { await endLive(h.id); onChanged(l('ended')) } catch (e) { onError(e.response?.data?.error || l('save_failed')); onChanged('') } finally { setBusy(false) }
  }
  return (
    <tr>
      <td className="py-2 pr-3 font-medium text-gray-800">{h.name}</td>
      <td className="pr-3 text-gray-600">{h.location}</td>
      <td className="pr-3 text-gray-600">{h.shift ? t(`page_hosts.${SHIFT_LABEL[h.shift]}`) : <span className="text-amber-600">{l('no_shift')}</span>}</td>
      <td className="pr-3">
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={saveUrl} placeholder="https://www.tiktok.com/@…/live" className={inputCls} aria-label={l('col_url')} />
          <button type="button" disabled={busy || h.status !== 'live'} onClick={end} className={`${btnGhost} whitespace-nowrap ${h.status === 'live' ? 'border-red-300 text-red-700' : ''}`}>{l('end_live')}</button>
        </div>
      </td>
      <td>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[h.status] || STATUS_CLS.offline}`}>{l(`status_${h.status}`)}</span>
        {h.status !== 'live' && h.next_at && <p className="text-xs text-gray-400 mt-0.5">{l('next')}: {formatTaipei(h.next_at)}</p>}
        {h.status === 'live' && h.window_end && <p className="text-xs text-gray-400 mt-0.5">{l('until')}: {formatTaipei(h.window_end)}</p>}
      </td>
    </tr>
  )
}
