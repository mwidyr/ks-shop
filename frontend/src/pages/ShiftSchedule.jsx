import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createAttendanceStatus, createEmployeeLocation, getSchedule, getScheduleSettings, saveSchedule, updateAttendanceStatus, updateEmployeeLocation,
} from '../api/employee'
import { useCanEdit } from '../context/AccessContext'
import { cardClasses } from '../components/Table'
import { STATUS_COLORS, currentMonth, monthLabel, shiftMonth, statusStyle } from '../utils/employeeUi'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function StatusChip({ status, active = true }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] ${active ? '' : 'opacity-50'}`}><span className="rounded px-1.5 py-0.5 font-bold" style={statusStyle(status)}>{status.code}</span>{status.name}</span>
}

function colorOptions() {
  return Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
}

function StatusForm({ initial, onCancel, onSaved }) {
  const { t } = useTranslation()
  const isEdit = Boolean(initial?.id)
  const [f, setF] = useState(initial || { code: '', name: '', is_paid: true, deduct_bonus: false, bg_color: 'gray', text_color: 'black', is_active: true })
  const [err, setErr] = useState('')
  async function save() {
    setErr('')
    try {
      if (isEdit) await updateAttendanceStatus(initial.id, f)
      else await createAttendanceStatus(f)
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.error || t('page_employee.save_error'))
    }
  }
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-[var(--text-primary)]">{isEdit ? t('page_employee.edit_status') : t('page_employee.add_status')}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.code')}<input value={f.code} disabled={isEdit} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={10} className={`${inputCls} w-full mt-1 disabled:bg-gray-50`} /></label>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.status_name')}<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${inputCls} w-full mt-1`} /></label>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.bg_color')}<select value={f.bg_color} onChange={(e) => setF({ ...f, bg_color: e.target.value })} className={`${inputCls} w-full mt-1`}>{colorOptions()}</select></label>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.text_color')}<select value={f.text_color} onChange={(e) => setF({ ...f, text_color: e.target.value })} className={`${inputCls} w-full mt-1`}>{colorOptions()}</select></label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_paid} onChange={(e) => setF({ ...f, is_paid: e.target.checked })} />{t('page_employee.paid')}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.deduct_bonus} onChange={(e) => setF({ ...f, deduct_bonus: e.target.checked })} />{t('page_employee.deduct_bonus')}</label>
        {isEdit && !initial.is_default && <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />{t('page_employee.active')}</label>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.status_hint')}</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg">{t('common.cancel')}</button>
        <button type="button" onClick={save} disabled={!f.name.trim() || (!isEdit && !f.code.trim())} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">{t('page_employee.save_status')}</button>
      </div>
    </div>
  )
}

// Schedule Settings: Employee Locations (shared with Employee List and Payroll, separate from Host Management) and Attendance Statuses.
function SettingsModal({ onClose, onChanged }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('locations')
  const [data, setData] = useState(null)
  const [newLoc, setNewLoc] = useState('')
  const [editStatus, setEditStatus] = useState(null) // null | {} | status
  const [err, setErr] = useState('')
  const load = useCallback(() => getScheduleSettings().then(setData), [])
  useEffect(() => { load() }, [load])
  const changed = () => { load(); onChanged() }

  async function run(fn) {
    setErr('')
    try { await fn(); changed() } catch (e) { setErr(e.response?.data?.error || t('page_employee.save_error')) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--table-card-bg)] rounded-2xl w-full max-w-xl p-5 space-y-4 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg text-[var(--text-primary)]">{t('page_employee.schedule_settings')}</h2><button type="button" onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button></div>
        <div className="flex gap-2">
          {[['locations', t('page_employee.location_settings')], ['statuses', t('page_employee.attendance_status')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setEditStatus(null); setErr('') }} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${tab === k ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
          ))}
        </div>
        {!data ? <p className="text-center text-gray-400 py-6">{t('common.loading')}</p> : tab === 'locations' ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.location_settings_hint')}</p>
            {data.locations.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                <input defaultValue={l.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) run(() => updateEmployeeLocation(l.id, { name: v, is_active: l.is_active })) }} className={`${inputCls} flex-1 ${l.is_active ? '' : 'opacity-50'}`} />
                {l.is_default ? <span className="text-xs text-[var(--text-secondary)]">{t('page_employee.default')}</span>
                  : <button type="button" onClick={() => run(() => updateEmployeeLocation(l.id, { name: l.name, is_active: !l.is_active }))} className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5">{l.is_active ? t('page_employee.deactivate') : t('page_employee.reactivate')}</button>}
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder={t('page_employee.new_location_ph')} className={`${inputCls} flex-1`} />
              <button type="button" disabled={!newLoc.trim()} onClick={() => run(async () => { await createEmployeeLocation({ name: newLoc }); setNewLoc('') })} className="bg-brand-600 text-white text-sm font-semibold px-4 rounded-lg disabled:opacity-40">+ {t('common.add')}</button>
            </div>
          </div>
        ) : editStatus ? (
          <StatusForm initial={editStatus.id ? editStatus : null} onCancel={() => setEditStatus(null)} onSaved={() => { setEditStatus(null); changed() }} />
        ) : (
          <div className="space-y-2">
            {data.statuses.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="rounded-md px-2 py-1 text-xs font-bold" style={statusStyle(s)}>{s.code}</span>
                  <div><p className="text-sm font-semibold text-[var(--text-primary)]">{s.name}</p><p className="text-[11px] text-[var(--text-secondary)]">{s.is_paid ? t('page_employee.paid') : t('page_employee.unpaid')} · {s.is_active ? t('page_employee.active') : t('page_employee.inactive')}{s.deduct_bonus ? ` · ${t('page_employee.deducts_bonus')}` : ''}</p></div>
                </div>
                <button type="button" onClick={() => setEditStatus(s)} className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5">{t('common.edit')}</button>
              </div>
            ))}
            <button type="button" onClick={() => setEditStatus({})} className="w-full border border-dashed border-gray-300 rounded-xl py-2 text-sm font-semibold text-gray-600">+ {t('page_employee.add_status')}</button>
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  )
}

export default function ShiftSchedule() {
  const { t } = useTranslation()
  const canEdit = useCanEdit()
  const [month, setMonth] = useState(currentMonth())
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null) // { r1, c1, r2, c2 } while / after dragging
  const [menu, setMenu] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dragging = useRef(false)

  const load = useCallback(() => getSchedule({ month, location_id: locationId }).then(setData).catch(() => setError('load')), [month, locationId])
  useEffect(() => { setData(null); load() }, [load])

  const statusById = useMemo(() => Object.fromEntries((data?.statuses || []).map((s) => [s.id, s])), [data])
  const defaultStatus = useMemo(() => (data?.statuses || []).find((s) => s.is_default), [data])
  const activeStatuses = (data?.statuses || []).filter((s) => s.is_active)

  const box = sel && { r1: Math.min(sel.r1, sel.r2), r2: Math.max(sel.r1, sel.r2), c1: Math.min(sel.c1, sel.c2), c2: Math.max(sel.c1, sel.c2) }
  const inSel = (r, c) => box && r >= box.r1 && r <= box.r2 && c >= box.c1 && c <= box.c2
  const count = box ? (box.r2 - box.r1 + 1) * (box.c2 - box.c1 + 1) : 0

  useEffect(() => {
    const up = () => { if (dragging.current) { dragging.current = false; setMenu(true) } }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const start = (r, c) => { if (!canEdit) return; dragging.current = true; setMenu(false); setSel({ r1: r, c1: c, r2: r, c2: c }) }
  const extend = (r, c) => { if (dragging.current) setSel((s) => ({ ...s, r2: r, c2: c })) }

  async function apply(status) {
    if (!box) return
    const changes = []
    for (let r = box.r1; r <= box.r2; r++) changes.push({ employee_id: data.employees[r].id, dates: data.dates.slice(box.c1, box.c2 + 1), status_id: status.id })
    setMenu(false)
    setError('')
    // optimistic update, saved automatically
    setData((d) => ({ ...d, employees: d.employees.map((e, r) => (r < box.r1 || r > box.r2 ? e : { ...e, records: Object.fromEntries([...Object.entries(e.records).filter(([date]) => !d.dates.slice(box.c1, box.c2 + 1).includes(date)), ...(status.is_default ? [] : d.dates.slice(box.c1, box.c2 + 1).map((date) => [date, status.id]))]) })) }))
    setSel(null)
    try { await saveSchedule(changes) } catch (err) { setError(err.response?.data?.error || t('page_employee.save_error')); load() }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-full mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-xl font-bold text-[var(--text-primary)]">{t('nav.items.shift_schedule')}</h1><p className="text-sm text-[var(--text-secondary)]">Ralulu Admin / EMPLOYEE</p></div>
        {canEdit && <button type="button" onClick={() => setSettingsOpen(true)} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-full">⚙ {t('page_employee.settings')}</button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="border border-gray-300 rounded-full w-9 h-9">‹</button>
          <span className="font-semibold text-[var(--text-primary)] min-w-[9rem] text-center">{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="border border-gray-300 rounded-full w-9 h-9">›</button>
        </div>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
          <option value="">{t('page_employee.all_locations')}</option>
          {(data?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-3 items-center">{(data?.statuses || []).filter((s) => s.is_active).map((s) => <StatusChip key={s.id} status={s} />)}</div>
      {canEdit && <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.schedule_hint')}</p>}
      {error && <p className="text-sm text-red-600">{error === 'load' ? t('page_employee.load_error') : error}</p>}

      {!data ? <div className={`${cardClasses} p-8 text-center text-gray-400`}>{t('common.loading')}</div> : (
        <div className={`${cardClasses} overflow-x-auto select-none`}>
          <table className="border-separate text-xs" style={{ borderSpacing: 3 }}>
            <thead><tr>
              <th className="sticky left-0 z-10 bg-[var(--table-card-bg)] text-left p-2 min-w-[8rem]">{t('page_employee.employee')}</th>
              {data.dates.map((d) => { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return (
                <th key={d} className={`p-1 font-normal text-center min-w-[2.25rem] rounded ${wd === 0 || wd === 6 ? 'bg-gray-100' : ''}`}><div className="font-semibold">{Number(d.slice(8))}</div><div className="text-[10px] text-gray-400">{WEEKDAYS[wd]}</div></th>
              ) })}
            </tr></thead>
            <tbody>
              {data.employees.map((e, r) => (
                <tr key={e.id}>
                  <td className="sticky left-0 z-10 bg-[var(--table-card-bg)] p-2"><p className="font-semibold text-[var(--text-primary)]">{e.nickname}</p><p className="text-[10px] text-[var(--text-secondary)]">{e.location}</p></td>
                  {data.dates.map((d, c) => {
                    const s = statusById[e.records[d]] || defaultStatus
                    return (
                      <td key={d} onMouseDown={() => start(r, c)} onMouseEnter={() => extend(r, c)}
                        className={`h-9 min-w-[2.25rem] text-center font-semibold rounded-lg ${canEdit ? 'cursor-pointer' : ''} ${inSel(r, c) ? 'ring-2 ring-brand-600' : ''}`}
                        style={s ? statusStyle(s) : undefined}>{s?.code}</td>
                    )
                  })}
                </tr>
              ))}
              {data.employees.length === 0 && <tr><td colSpan={data.dates.length + 1} className="p-6 text-center text-gray-400">{t('page_employee.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {menu && box && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-xl p-4 space-y-2 max-w-[95vw]">
          <p className="text-sm">{t('page_employee.apply_status', { count })}</p>
          <div className="flex flex-wrap gap-2">
            {activeStatuses.map((s) => <button key={s.id} type="button" onClick={() => apply(s)} className="border border-gray-500 rounded-full px-3 py-1.5 text-sm hover:bg-gray-700">{s.code} — {s.name}</button>)}
            <button type="button" onClick={() => { setMenu(false); setSel(null) }} className="text-sm text-gray-300 px-2">{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onChanged={load} />}
    </div>
  )
}
