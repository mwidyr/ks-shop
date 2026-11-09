import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createEmployee, createPosition, deletePosition, exportEmployees, getEmployee, getEmployeeMeta, importEmployees, listEmployees, renamePosition, updateEmployee } from '../api/employee'
import { useCanEdit } from '../context/AccessContext'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../utils/hooks'
import { cardClasses } from '../components/Table'
import DateInput from '../components/DateInput'
import { EMPLOYEE_STATUSES, statusLabel } from '../utils/employeeUi'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full'
const emptyForm = {
  full_name: '', nickname: '', mbti: '', birthday: '', nik: '', address: '', position_id: '', location_id: '', host_id: '', whatsapp: '',
  status: 'full_time', join_date: '', bank_holder: '', bank_name: '', bank_account: '', emergency_name: '', emergency_number: '',
}

function Field({ label, required, children }) {
  return <label className="block"><span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}{required ? ' *' : ''}</span>{children}</label>
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-[var(--text-primary)]">
        {title}<span className="text-gray-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  )
}

// Add and Edit share this form: four independently collapsible sections.
function EmployeeForm({ employee, meta, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = Boolean(employee)
  const [form, setForm] = useState(emptyForm)
  const [positions, setPositions] = useState(meta.positions)
  const [loading, setLoading] = useState(isEdit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sensitive = meta.can_see_sensitive
  const canEdit = useCanEdit()

  useEffect(() => {
    if (!isEdit) return
    getEmployee(employee.id).then((d) => {
      setForm({
        full_name: d.full_name, nickname: d.nickname, mbti: d.mbti, birthday: d.birthday || '', nik: d.nik, address: d.address,
        position_id: String(d.position_id), location_id: String(d.location_id), host_id: d.host_id ? String(d.host_id) : '', whatsapp: d.whatsapp,
        status: d.status, join_date: d.join_date || '', bank_holder: d.bank_holder, bank_name: d.bank_name, bank_account: d.bank_account,
        emergency_name: d.emergency_name, emergency_number: d.emergency_number,
      })
      setLoading(false)
    })
  }, [employee, isEdit])
  useEffect(() => { if (!isEdit && meta.locations[0]) setForm((f) => ({ ...f, location_id: String((meta.locations.find((l) => l.is_default) || meta.locations[0]).id) })) }, [isEdit, meta.locations])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function addPosition() {
    const name = window.prompt(t('page_employee.new_position_prompt'))
    if (!name || !name.trim()) return
    try {
      const p = await createPosition(name.trim())
      setPositions((list) => (list.some((x) => x.id === p.id) ? list : [...list, p].sort((a, b) => a.name.localeCompare(b.name))))
      setForm((f) => ({ ...f, position_id: String(p.id) }))
    } catch (err) {
      setError(err.response?.data?.error || t('page_employee.save_error'))
    }
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = { ...form, position_id: Number(form.position_id), location_id: Number(form.location_id), host_id: form.host_id ? Number(form.host_id) : null, birthday: form.birthday || null, join_date: form.join_date || null }
    try {
      if (isEdit) await updateEmployee(employee.id, body)
      else await createEmployee(body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || t('page_employee.save_error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-[var(--table-card-bg)] rounded-2xl w-full max-w-2xl p-5 space-y-3 my-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-lg text-[var(--text-primary)]">{isEdit ? t('page_employee.edit_employee') : t('page_employee.add_employee')}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{isEdit ? employee.emp_code : t('page_employee.id_auto')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        {loading ? <p className="text-center text-gray-400 py-8">{t('common.loading')}</p> : (
          <fieldset disabled={!canEdit} className="space-y-3">
            <Section title={`A. ${t('page_employee.sec_personal')}`}>
              <Field label={t('page_employee.full_name')} required><input value={form.full_name} onChange={set('full_name')} required className={inputCls} /></Field>
              <Field label={t('page_employee.nickname')} required><input value={form.nickname} onChange={set('nickname')} required className={inputCls} /></Field>
              <Field label="MBTI"><input value={form.mbti} onChange={set('mbti')} maxLength={10} placeholder="ENTJ-A" className={inputCls} /></Field>
              <Field label={t('page_employee.birthday')}><DateInput value={form.birthday} onChange={(v) => setForm((f) => ({ ...f, birthday: v }))} className={inputCls} /></Field>
              {sensitive && <Field label={t('page_employee.nik')}><input value={form.nik} onChange={set('nik')} inputMode="numeric" className={inputCls} /></Field>}
              {sensitive && <Field label={t('page_employee.address')}><input value={form.address} onChange={set('address')} className={inputCls} /></Field>}
            </Section>
            <Section title={`B. ${t('page_employee.sec_employment')}`}>
              <Field label={t('page_employee.position')} required>
                <div className="flex gap-2">
                  <select value={form.position_id} onChange={set('position_id')} required className={inputCls}><option value="">{t('page_employee.select_position')}</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <button type="button" onClick={addPosition} title={t('page_employee.add_position')} className="shrink-0 border border-gray-300 rounded-lg px-3 font-bold">+</button>
                </div>
              </Field>
              <Field label={t('page_employee.location')} required>
                <select value={form.location_id} onChange={set('location_id')} required className={inputCls}>{meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              </Field>
              <Field label={t('page_employee.linked_host')}>
                <select value={form.host_id} onChange={set('host_id')} className={inputCls}><option value="">{t('page_employee.not_linked')}</option>{meta.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
              </Field>
              <Field label="WhatsApp"><input value={form.whatsapp} onChange={set('whatsapp')} inputMode="tel" className={inputCls} /></Field>
              <Field label={t('page_employee.status')}>
                <select value={form.status} onChange={set('status')} className={inputCls}>{EMPLOYEE_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
              <Field label={t('page_employee.join_date')}><DateInput value={form.join_date} onChange={(v) => setForm((f) => ({ ...f, join_date: v }))} className={inputCls} /></Field>
              <p className="sm:col-span-2 text-xs text-[var(--text-secondary)]">{t('page_employee.location_hint')}</p>
            </Section>
            {sensitive ? (
              <>
                <Section title={`C. ${t('page_employee.sec_bank')}`} defaultOpen={false}>
                  <Field label={t('page_employee.bank_holder')}><input value={form.bank_holder} onChange={set('bank_holder')} className={inputCls} /></Field>
                  <Field label={t('page_employee.bank_name')}><input value={form.bank_name} onChange={set('bank_name')} className={inputCls} /></Field>
                  <Field label={t('page_employee.bank_account')}><input value={form.bank_account} onChange={set('bank_account')} inputMode="numeric" className={inputCls} /></Field>
                </Section>
                <Section title={`D. ${t('page_employee.sec_emergency')}`}>
                  <Field label={t('page_employee.emergency_name')}><input value={form.emergency_name} onChange={set('emergency_name')} className={inputCls} /></Field>
                  <Field label={t('page_employee.emergency_number')}><input value={form.emergency_number} onChange={set('emergency_number')} inputMode="tel" className={inputCls} /></Field>
                </Section>
              </>
            ) : <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.sensitive_restricted')}</p>}
          </fieldset>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg">{t('common.cancel')}</button>
          {canEdit && <button type="submit" disabled={busy || loading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.save_employee')}</button>}
        </div>
      </form>
    </div>
  )
}


// Position Settings: add, rename and delete positions. A position that employees still have cannot be deleted.
function PositionSettings({ positions, onClose, onChanged }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  async function run(fn) {
    setErr('')
    try { await fn(); onChanged() } catch (e) { setErr(e.response?.data?.error || t('page_employee.save_error')) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--table-card-bg)] rounded-2xl w-full max-w-md p-5 space-y-3 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg text-[var(--text-primary)]">{t('page_employee.position_settings')}</h2><button type="button" onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button></div>
        <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.position_settings_hint')}</p>
        {positions.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <input defaultValue={p.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) run(() => renamePosition(p.id, v)); else e.target.value = p.name }} className={inputCls} />
            <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">{t('page_employee.n_employees', { count: p.employee_count })}</span>
            <button type="button" disabled={p.employee_count > 0} title={p.employee_count > 0 ? t('page_employee.position_in_use') : ''}
              onClick={() => window.confirm(t('page_employee.delete_position_confirm', { name: p.name })) && run(() => deletePosition(p.id))}
              className="text-xs font-semibold text-red-600 border border-red-300 rounded-lg px-2.5 py-1.5 disabled:opacity-40">{t('common.delete')}</button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('page_employee.new_position_ph')} className={inputCls} />
          <button type="button" disabled={!name.trim()} onClick={() => run(async () => { await createPosition(name.trim()); setName('') })} className="shrink-0 bg-brand-600 text-white text-sm font-semibold px-4 rounded-lg disabled:opacity-40">+ {t('common.add')}</button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  )
}

const EXPORT_COLUMNS = [
  ['Employee ID', 'emp_code'], ['Full Name', 'full_name'], ['Nickname', 'nickname'], ['MBTI', 'mbti'], ['Birthday', 'birthday'], ['ID Number (NIK)', 'nik'],
  ['Address', 'address'], ['Position', 'position'], ['Location', 'location'], ['Linked to Host', 'host_name'], ['WhatsApp', 'whatsapp'], ['Status', 'status'],
  ['Join Date', 'join_date'], ['Account Holder Name', 'bank_holder'], ['Bank Name', 'bank_name'], ['Bank Account Number', 'bank_account'],
  ['Emergency Contact Name', 'emergency_name'], ['Emergency Contact Number', 'emergency_number'],
]
const TEXT_COLUMNS = new Set(['nik', 'bank_account', 'whatsapp', 'emergency_number'])
const statusFromCell = (v) => {
  const s = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return EMPLOYEE_STATUSES.find(([k, l]) => k === s || l.toLowerCase().replace(/-/g, '_') === s)?.[0] || ''
}

export default function EmployeeList() {
  const { t } = useTranslation()
  const canEdit = useCanEdit()
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState({ employees: [], counts: { total: 0, active: 0, inactive: 0 } })
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  const [locationId, setLocationId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [form, setForm] = useState(null) // null | {} (new) | employee
  const [message, setMessage] = useState('')
  const [positionsOpen, setPositionsOpen] = useState(false)
  const fileRef = useRef(null)
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS)

  const loadMeta = useCallback(() => getEmployeeMeta().then(setMeta), [])
  useEffect(() => { loadMeta() }, [loadMeta])
  const load = useCallback(() => listEmployees({ q: debouncedQ, location_id: locationId, position_id: positionId, status, group }).then(setData), [debouncedQ, locationId, positionId, status, group])
  useEffect(() => { load() }, [load])

  const hasFilters = Boolean(q || locationId || positionId || status || group)
  const clear = () => { setQ(''); setLocationId(''); setPositionId(''); setStatus(''); setGroup('') }
  const cards = useMemo(() => [['', t('page_employee.card_total'), data.counts.total], ['active', t('page_employee.card_active'), data.counts.active], ['inactive', t('page_employee.card_inactive'), data.counts.inactive]], [data.counts, t])

  async function doExport() {
    setMessage('')
    try {
      const [XLSX, all] = await Promise.all([import('xlsx'), exportEmployees()])
      const rows = all.map((e) => EXPORT_COLUMNS.map(([, key]) => (key === 'status' ? statusLabel(e.status) : (e[key] ?? ''))))
      const ws = XLSX.utils.aoa_to_sheet([EXPORT_COLUMNS.map(([h]) => h), ...rows])
      // NIK, bank account and phone numbers are written as text so leading zeros survive
      const range = XLSX.utils.decode_range(ws['!ref'])
      EXPORT_COLUMNS.forEach(([, key], c) => {
        if (!TEXT_COLUMNS.has(key)) return
        for (let r = 1; r <= range.e.r; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell) { cell.t = 's'; cell.z = '@' } }
      })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Employees')
      XLSX.writeFile(wb, 'employees.xlsx')
    } catch {
      setMessage(t('page_employee.export_error'))
    }
  }

  async function doImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setMessage('')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
      const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' })
      const rows = sheet.map((r) => {
        const pick = (h) => String(r[h] ?? '').trim()
        return {
          emp_code: pick('Employee ID'), full_name: pick('Full Name'), nickname: pick('Nickname'), mbti: pick('MBTI'), birthday: pick('Birthday'), nik: pick('ID Number (NIK)'),
          address: pick('Address'), position: pick('Position'), location: pick('Location'), host: pick('Linked to Host'), whatsapp: pick('WhatsApp'),
          status: statusFromCell(pick('Status')), join_date: pick('Join Date'), bank_holder: pick('Account Holder Name'), bank_name: pick('Bank Name'),
          bank_account: pick('Bank Account Number'), emergency_name: pick('Emergency Contact Name'), emergency_number: pick('Emergency Contact Number'),
        }
      }).filter((r) => r.full_name || r.emp_code)
      if (rows.length === 0) { setMessage(t('page_employee.import_empty')); return }
      const res = await importEmployees(rows)
      setMessage(t('page_employee.import_done', { created: res.created, updated: res.updated }))
      load()
    } catch (err) {
      const errs = err.response?.data?.errors
      setMessage(errs ? `${t('page_employee.import_failed')}: ${errs.slice(0, 5).map((x) => `#${x.row} ${x.message}`).join('; ')}${errs.length > 5 ? ' …' : ''}` : (err.response?.data?.error || t('page_employee.import_failed')))
    }
  }

  if (!meta) return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>
  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-xl font-bold text-[var(--text-primary)]">{t('nav.items.employee_list')}</h1><p className="text-sm text-[var(--text-secondary)]">Ralulu Admin / EMPLOYEE</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={doExport} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.export_excel')}</button>
          {canEdit && <><input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={doImport} />
            <button type="button" onClick={() => fileRef.current?.click()} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.import_excel')}</button>
            <button type="button" onClick={() => setPositionsOpen(true)} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.position_settings')}</button>
            <button type="button" onClick={() => setForm({})} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ {t('page_employee.add_employee')}</button></>}
        </div>
      </div>
      {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}

      <div className="grid grid-cols-3 gap-3">
        {cards.map(([key, label, n]) => (
          <button key={key || 'all'} type="button" onClick={() => setGroup(key)} className={`${cardClasses} p-4 text-left border-2 ${group === key ? 'border-brand-600' : 'border-transparent'}`}>
            <p className="text-xs text-[var(--text-secondary)]">{label}</p><p className="text-2xl font-bold text-[var(--text-primary)]">{n}</p>
          </button>
        ))}
      </div>

      <div className={`${cardClasses} p-4 space-y-3`}>
        <div className="grid gap-2 sm:grid-cols-[2fr,1fr]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('page_employee.search_ph')} className={inputCls} />
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}><option value="">{t('page_employee.all_locations')}</option>{meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className={`${inputCls} sm:w-48`}><option value="">{t('page_employee.all_positions')}</option>{meta.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} sm:w-48`}><option value="">{t('page_employee.all_statuses')}</option>{EMPLOYEE_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span className="text-xs text-[var(--text-secondary)] ml-auto">{t('page_employee.n_records', { count: data.employees.length })}</span>
          {hasFilters && <button type="button" onClick={clear} className="text-xs font-semibold text-brand-600 hover:underline">{t('page_employee.clear_filters')}</button>}
        </div>
      </div>

      <div className={`${cardClasses} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
            <th className="p-3">{t('page_employee.employee')}</th><th className="p-3">{t('page_employee.position')}</th><th className="p-3">{t('page_employee.location')}</th>
            <th className="p-3">WhatsApp</th><th className="p-3">{t('page_employee.status')}</th><th className="p-3">{t('page_employee.join_date')}</th><th className="p-3 w-6" />
          </tr></thead>
          <tbody>
            {data.employees.map((e) => (
              <Fragment key={e.id}>
                <tr onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="cursor-pointer hover:bg-[var(--table-row-hover)] border-t border-[var(--table-divider)]">
                  <td className="p-3"><p className="font-semibold text-[var(--text-primary)]">{e.full_name}</p><p className="text-[11px] text-[var(--text-secondary)]">{e.emp_code} · {e.nickname}</p></td>
                  <td className="p-3">{e.position}</td>
                  <td className="p-3"><span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold">{e.location}</span></td>
                  <td className="p-3 font-mono text-xs">{e.whatsapp || '—'}</td>
                  <td className="p-3">{statusLabel(e.status)}</td>
                  <td className="p-3 whitespace-nowrap">{e.join_date || '—'}</td>
                  <td className="p-3 text-gray-400">{expanded === e.id ? '▴' : '▾'}</td>
                </tr>
                {expanded === e.id && (
                  <tr className="bg-[var(--table-header-bg)]"><td colSpan={7} className="p-4">
                    <div className="grid gap-3 sm:grid-cols-4 text-sm">
                      <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">MBTI</p><p>{e.mbti || '—'}</p></div>
                      <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">{t('page_employee.birthday')}</p><p>{e.birthday || '—'}</p></div>
                      <div><p className="text-[11px] uppercase text-[var(--text-secondary)]">{t('page_employee.linked_host')}</p><p>{e.host_name || t('page_employee.not_linked')}</p></div>
                      <div className="sm:text-right">{canEdit
                        ? <button type="button" onClick={() => setForm(e)} className="border border-gray-300 bg-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.open_full_form')}</button>
                        : <button type="button" onClick={() => setForm(e)} className="border border-gray-300 bg-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.view_details')}</button>}</div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {data.employees.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-400">{t('page_employee.none')}</td></tr>}
          </tbody>
        </table>
      </div>

      {positionsOpen && <PositionSettings positions={meta.positions} onClose={() => setPositionsOpen(false)} onChanged={() => { loadMeta(); load() }} />}
      {form && <EmployeeForm employee={form.id ? form : null} meta={meta} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} />}
    </div>
  )
}
