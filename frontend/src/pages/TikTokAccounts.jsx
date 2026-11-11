import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createTikTokDevice, getTikTokStructure, listTikTokAccounts, updateTikTokDevice } from '../api/tiktok'
import { useCanEdit } from '../context/AccessContext'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../utils/hooks'
import { cardClasses } from '../components/Table'

export const STATUSES = ['LIVE', 'BACKUP', 'BLOCKED', 'OHCA']
export const STATUS_STYLE = {
  LIVE: 'bg-emerald-500/20 text-emerald-600',
  BACKUP: 'bg-slate-500/20 text-[var(--text-secondary)]',
  BLOCKED: 'bg-red-500/20 text-red-600',
  OHCA: 'bg-amber-500/20 text-amber-600',
}
const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full'

export function StatusBadge({ status }) {
  return <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${STATUS_STYLE[status] || 'bg-slate-500/20 text-[var(--text-secondary)]'}`}>{status}</span>
}

function AccountsTab({ structure }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [locationId, setLocationId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [sort, setSort] = useState('status') // status (default, server order) | name | room
  const [data, setData] = useState({ counts: {}, accounts: [] })
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS)

  const load = useCallback(() => {
    listTikTokAccounts({ status, q: debouncedQ, location_id: locationId, room_id: roomId, device_id: deviceId }).then(setData)
  }, [status, debouncedQ, locationId, roomId, deviceId])
  useEffect(() => { load() }, [load])

  const rooms = useMemo(() => structure.filter((l) => !locationId || String(l.id) === locationId).flatMap((l) => l.rooms), [structure, locationId])
  const devices = useMemo(() => rooms.filter((r) => !roomId || String(r.id) === roomId).flatMap((r) => r.devices), [rooms, roomId])
  const reset = () => { setStatus(''); setQ(''); setLocationId(''); setRoomId(''); setDeviceId(''); setSort('status') }
  // natural order: "Room 2" before "Room 10", ROOM001 before ROOM002
  const accounts = useMemo(() => {
    const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' })
    if (sort === 'name') return [...data.accounts].sort((a, b) => cmp(a.tiktok_id, b.tiktok_id))
    if (sort === 'room') return [...data.accounts].sort((a, b) => cmp(a.location_name, b.location_name) || cmp(a.room_name, b.room_name) || cmp(a.tiktok_id, b.tiktok_id))
    return data.accounts
  }, [data.accounts, sort])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <div key={s} className={`${cardClasses} p-4`}>
            <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{s}</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{data.counts[s] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className={`${cardClasses} p-4 space-y-3`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('page_tiktok.search_ph')} className={inputCls} />
        <div className="flex flex-wrap gap-2">
          {['', ...STATUSES].map((s) => (
            <button key={s || 'all'} type="button" onClick={() => setStatus(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${status === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {s || t('page_tiktok.all')}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setRoomId(''); setDeviceId('') }} className={inputCls}>
            <option value="">{t('page_tiktok.all_locations')}</option>
            {structure.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={roomId} onChange={(e) => { setRoomId(e.target.value); setDeviceId('') }} className={inputCls}>
            <option value="">{t('page_tiktok.all_rooms')}</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={inputCls}>
            <option value="">{t('page_tiktok.all_devices')}</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">{t('page_tiktok.sort_label')}
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={inputCls + ' !w-auto'}>
              <option value="status">{t('page_tiktok.sort_status')}</option>
              <option value="name">{t('page_tiktok.sort_name')}</option>
              <option value="room">{t('page_tiktok.sort_room')}</option>
            </select>
          </label>
          <button type="button" onClick={reset} className="text-xs font-semibold text-gray-500 hover:underline">{t('page_tiktok.reset_filters')}</button>
        </div>
      </div>

      <div className={`${cardClasses} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
              <th className="p-3">TikTok ID</th><th className="p-3">{t('page_tiktok.status')}</th><th className="p-3">{t('page_tiktok.device')}</th>
              <th className="p-3">{t('page_tiktok.location')}</th><th className="p-3">{t('page_tiktok.room')}</th><th className="p-3 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--table-divider)]">
            {accounts.map((a) => (
              <tr key={a.id} onClick={() => navigate(`/tiktok/accounts/${a.id}`)} className="cursor-pointer hover:bg-[var(--table-row-hover)]">
                <td className="p-3 font-semibold text-[var(--text-primary)]">@{a.tiktok_id}</td>
                <td className="p-3"><StatusBadge status={a.status} /></td>
                <td className="p-3">{a.device_name || '—'}</td>
                <td className="p-3">{a.location_name || '—'}</td>
                <td className="p-3">{a.room_name || '—'}</td>
                <td className="p-3 text-gray-400">›</td>
              </tr>
            ))}
            {data.accounts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('page_tiktok.none')}</td></tr>}
          </tbody>
        </table>
        <p className="p-3 text-xs text-[var(--text-secondary)]">{t('page_tiktok.showing', { shown: data.accounts.length, total: STATUSES.reduce((n, s) => n + (data.counts[s] || 0), 0) })}</p>
      </div>
    </div>
  )
}

// Location > Room > Device. Every Location has ROOM001-ROOM005; devices are added under a room and can be renamed or moved.
function DeviceRow({ device, location, structure, canEdit, onSaved }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.name)
  const [target, setTarget] = useState('')
  const [err, setErr] = useState('')
  const rooms = structure.flatMap((l) => l.rooms.map((r) => ({ id: r.id, label: `${l.name} / ${r.name}` })))

  async function save() {
    setErr('')
    try {
      await updateTikTokDevice(device.id, { name, room_id: Number(target) })
      setEditing(false)
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.error || t('page_tiktok.save_error'))
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-2">
        <div><p className="text-sm font-semibold text-[var(--text-primary)]">{device.name}</p><p className="text-xs text-[var(--text-secondary)]">{location}</p></div>
        {canEdit && <button type="button" onClick={() => { setEditing(true); setName(device.name); setTarget(String(device.room_id)) }} className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1 hover:bg-gray-50">{t('common.edit')}</button>}
      </div>
    )
  }
  return (
    <div className="py-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={!name.trim()} className="bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40">{t('common.save')}</button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5">{t('common.cancel')}</button>
      </div>
    </div>
  )
}

function SettingsTab({ structure, reload, canEdit }) {
  const { t } = useTranslation()
  const [locationId, setLocationId] = useState('')
  const [open, setOpen] = useState(null)
  const [newName, setNewName] = useState('')
  const [err, setErr] = useState('')
  const location = structure.find((l) => String(l.id) === locationId) || structure[0]

  async function addDevice(roomId) {
    setErr('')
    try {
      await createTikTokDevice({ room_id: roomId, name: newName })
      setNewName('')
      reload()
    } catch (e) {
      setErr(e.response?.data?.error || t('page_tiktok.save_error'))
    }
  }

  if (!location) return <div className={`${cardClasses} p-6 text-center text-gray-400`}>{t('page_tiktok.no_locations')}</div>
  return (
    <div className="space-y-4">
      <div className={`${cardClasses} p-4`}>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('page_tiktok.location')}</label>
        <select value={String(location.id)} onChange={(e) => { setLocationId(e.target.value); setOpen(null) }} className={inputCls}>
          {structure.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <p className="text-xs text-[var(--text-secondary)] mt-2">{t('page_tiktok.rooms_hint')}</p>
      </div>
      {location.rooms.map((room) => (
        <div key={room.id} className={`${cardClasses} overflow-hidden`}>
          <button type="button" onClick={() => setOpen(open === room.id ? null : room.id)} className="w-full flex items-center justify-between p-4 text-left">
            <span className="font-bold text-[var(--text-primary)]">{room.name} <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">{t('page_tiktok.n_devices', { count: room.devices.length })}</span></span>
            <span className="text-gray-400">{open === room.id ? '▴' : '▾'}</span>
          </button>
          {open === room.id && (
            <div className="px-4 pb-4 divide-y divide-[var(--table-divider)]">
              {room.devices.map((d) => <DeviceRow key={d.id} device={{ ...d, room_id: room.id }} location={`${location.name} / ${room.name}`} structure={structure} canEdit={canEdit} onSaved={reload} />)}
              {canEdit && (
                <div className="pt-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('page_tiktok.device_name_ph')} className={inputCls} />
                    <button type="button" disabled={!newName.trim()} onClick={() => addDevice(room.id)} className="shrink-0 bg-brand-600 text-white text-sm font-semibold px-4 rounded-lg disabled:opacity-40">+ {t('page_tiktok.add_device')}</button>
                  </div>
                  {err && <p className="text-xs text-red-600">{err}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TikTokAccounts() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [tab, setTab] = useState('accounts')
  const [structure, setStructure] = useState([])
  const loadStructure = useCallback(() => getTikTokStructure().then(setStructure).catch(() => setStructure([])), [])
  useEffect(() => { loadStructure() }, [loadStructure])

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('page_tiktok.title')}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t('page_tiktok.subtitle')}</p>
        </div>
        {canEdit && tab === 'accounts' && <button type="button" onClick={() => navigate('/tiktok/accounts/new')} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ {t('page_tiktok.add_account')}</button>}
      </div>
      <div className="flex gap-1 border-b border-[var(--table-divider)]">
        {[['accounts', t('page_tiktok.tab_accounts')], ['settings', t('page_tiktok.tab_settings')]].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}>{label}</button>
        ))}
      </div>
      {tab === 'accounts' ? <AccountsTab structure={structure} /> : <SettingsTab structure={structure} reload={loadStructure} canEdit={canEdit} />}
    </div>
  )
}
