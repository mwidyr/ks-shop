import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPortalHosts, getPortalOverview, submitViews } from '../api/cekViews'
import { useCanEdit } from '../context/AccessContext'

const SHIFTS = [['morning', 'Morning'], ['middle', 'Middle'], ['evening', 'Evening']]

const roomLabel = (room) => {
  const m = /^room\s*0*(\d+)$/i.exec(String(room || '').trim())
  return m ? `Room ${String(Number(m[1])).padStart(3, '0')}` : room
}

// Same flow as the old Apps Script page, in Ralulu: Location > Shift > enter Views for each Host > Kirim Views.
// Everything but the Views comes from Live Assignment (Room, Device, TikTok ID), so OPS only types numbers.
export default function CekViews() {
  const { t } = useTranslation()
  const canEdit = useCanEdit()
  const [overview, setOverview] = useState(null)
  const [location, setLocation] = useState(null)
  const [shift, setShift] = useState(null)
  const [hosts, setHosts] = useState([])
  const [views, setViews] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const loadOverview = () => getPortalOverview().then(setOverview).catch(() => setOverview([]))
  useEffect(() => { loadOverview() }, [])
  useEffect(() => {
    if (!location || !shift) return
    setHosts([])
    getPortalHosts(location.id, shift).then(setHosts).catch(() => setHosts([]))
  }, [location, shift])

  const filled = useMemo(() => hosts.filter((h) => String(views[h.host_id] ?? '').trim() !== ''), [hosts, views])

  function setValue(id, raw) {
    const digits = raw.replace(/[^\d]/g, '')
    setViews((v) => ({ ...v, [id]: digits }))
  }

  async function send() {
    setBusy(true)
    setError('')
    try {
      const res = await submitViews({ location_id: location.id, shift, entries: filled.map((h) => ({ host_id: h.host_id, views: Number(views[h.host_id]) })) })
      setResult(res)
    } catch (err) {
      setError(err.response?.data?.error || t('page_cek_views.send_error'))
    } finally {
      setBusy(false)
    }
  }

  const again = () => { setResult(null); setViews({}); setError('') }
  const back = () => { setError(''); setResult(null); setViews({}); if (shift) setShift(null); else setLocation(null) }
  const shiftTitle = SHIFTS.find(([k]) => k === shift)?.[1]

  return (
    <div className="max-w-md mx-auto min-h-[70vh] flex flex-col bg-[var(--table-page-bg)] sm:rounded-2xl sm:my-4 sm:border sm:border-[var(--table-divider)] overflow-hidden">
      <header className="bg-[var(--table-card-bg)] border-b border-[var(--table-divider)] px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[var(--text-primary)]">{location ? (shift ? `${shiftTitle} Shift` : location.name) : 'TikTok Views'}</h1>
          <p className="text-xs text-[var(--text-secondary)]">{!location ? t('page_cek_views.choose_location_short') : !shift ? t('page_cek_views.choose_shift_short') : `${location.name} · ${t('page_cek_views.enter_views_sub')}`}</p>
        </div>
        {location
          ? <button type="button" onClick={back} className="text-sm font-semibold border border-[var(--table-divider)] rounded-lg px-3 py-1.5 bg-[var(--table-card-bg)] text-[var(--text-primary)]">{shift ? t('page_cek_views.change_shift') : t('page_cek_views.change_location')}</button>
          : <button type="button" onClick={loadOverview} className="text-sm font-semibold border border-[var(--table-divider)] rounded-lg px-3 py-1.5 bg-[var(--table-card-bg)] text-[var(--text-primary)]">Refresh</button>}
      </header>

      {!location && (
        <div className="p-4 space-y-3">
          <div className="text-center py-2"><h2 className="text-lg font-extrabold text-[var(--text-primary)]">{t('page_cek_views.choose_location')}</h2><p className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.choose_location_hint')}</p></div>
          {!overview && <p className="text-center text-[var(--text-secondary)]">{t('common.loading')}</p>}
          {overview?.map((l) => (
            <button key={l.id} type="button" onClick={() => setLocation(l)} className="w-full flex items-center justify-between bg-[var(--table-card-bg)] rounded-2xl border border-[var(--table-divider)] px-5 py-5 text-left shadow-sm">
              <span className="text-xl font-extrabold text-[var(--text-primary)]">{l.name}</span><span className="text-[var(--text-secondary)] text-xl">›</span>
            </button>
          ))}
        </div>
      )}

      {location && !shift && (
        <div className="p-4 space-y-3">
          <div className="text-center py-2"><h2 className="text-lg font-extrabold text-[var(--text-primary)]">{t('page_cek_views.choose_shift')}</h2><p className="text-xs text-[var(--text-secondary)]">{t('page_cek_views.choose_shift_hint')}</p></div>
          {SHIFTS.map(([key, label]) => {
            const count = location.shifts[key]
            return (
              <button key={key} type="button" disabled={count === 0} onClick={() => setShift(key)} className="w-full flex items-center justify-between bg-[var(--table-card-bg)] rounded-2xl border border-[var(--table-divider)] px-5 py-4 text-left shadow-sm disabled:opacity-50">
                <span><span className="block text-xl font-extrabold text-[var(--text-primary)]">{label}</span><span className="text-sm text-[var(--text-secondary)]">{count} Host</span></span>
                <span className="text-[var(--text-secondary)] text-xl">›</span>
              </button>
            )
          })}
        </div>
      )}

      {location && shift && result && (
        <div className="p-4">
          <div className="bg-[var(--table-card-bg)] rounded-2xl border border-emerald-500/40 p-6 text-center space-y-3">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-extrabold text-emerald-600">{t('page_cek_views.sent_title')}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{t('page_cek_views.sent_saved', { count: result.saved })}</p>
            <p className={`text-sm ${result.telegram_sent ? 'text-[var(--text-secondary)]' : 'text-red-600 font-semibold'}`}>
              {result.telegram_sent ? t('page_cek_views.sent_telegram_ok') : `${t('page_cek_views.sent_telegram_fail')}: ${result.telegram_error || ''}`}
            </p>
            <button type="button" onClick={again} className="w-full bg-blue-600 text-white font-extrabold rounded-xl py-3 text-lg">{t('page_cek_views.input_again')}</button>
          </div>
        </div>
      )}

      {location && shift && !result && (
        <>
          <div className="flex-1 p-3 space-y-3 pb-24">
            {hosts.length === 0 && <p className="text-center text-[var(--text-secondary)] py-8">{t('page_cek_views.no_hosts')}</p>}
            {hosts.map((h) => (
              <div key={h.host_id} className="bg-[var(--table-card-bg)] rounded-2xl border border-[var(--table-divider)] p-4 flex items-center justify-between gap-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">{h.host_name}</p>
                  {h.room && <span className="inline-block text-xs font-bold bg-[var(--table-header-bg)] text-[var(--text-primary)] rounded px-2 py-0.5 my-1">{roomLabel(h.room)}</span>}
                  <p className="text-xs text-[var(--text-secondary)] truncate">{h.device}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">@{String(h.tiktok_id).replace(/^@/, '')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] tracking-wider">VIEWS</p>
                  <input inputMode="numeric" pattern="[0-9]*" value={views[h.host_id] ?? ''} onChange={(e) => setValue(h.host_id, e.target.value)}
                    className="w-28 text-center text-2xl font-extrabold border-2 border-emerald-500 rounded-xl py-2 bg-emerald-500/10 text-[var(--text-primary)] focus:outline-none focus:border-emerald-400" />
                </div>
              </div>
            ))}
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
          <div className="sticky bottom-0 bg-[var(--table-card-bg)] border-t border-[var(--table-divider)] p-3 flex items-center gap-3">
            <div className="text-center px-2"><p className="text-[10px] text-[var(--text-secondary)]">{t('page_cek_views.filled')}</p><p className="text-xl font-extrabold">{filled.length}</p></div>
            <button type="button" onClick={send} disabled={busy || !canEdit || filled.length === 0} className="flex-1 bg-blue-600 disabled:opacity-40 text-white font-extrabold rounded-xl py-3 text-lg">
              {busy ? t('common.loading') : 'Kirim Views'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
