import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addTikTokNote, createTikTokAccount, deleteTikTokNote, getTikTokAccount, getTikTokStructure, updateTikTokAccount } from '../api/tiktok'
import { useCanEdit } from '../context/AccessContext'
import DateInput from '../components/DateInput'
import { cardClasses } from '../components/Table'
import { STATUSES, StatusBadge } from './TikTokAccounts'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full disabled:opacity-60'
const emptyForm = {
  tiktok_id: '', status: 'BACKUP', account_level: 0, account_created_on: '', device_id: '', room_id: '', location_id: '',
  password: '', twofa: '', email: '', email_password: '',
}

function Field({ label, children }) {
  return <label className="block"><span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</span>{children}</label>
}

const toId = (v) => (v === '' || v == null ? null : Number(v))

export default function TikTokAccountDetail() {
  const { id } = useParams()
  const isNew = id === 'new'
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [structure, setStructure] = useState([])
  const [account, setAccount] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [showSecrets, setShowSecrets] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => { getTikTokStructure().then(setStructure).catch(() => setStructure([])) }, [])
  useEffect(() => {
    if (isNew) return
    getTikTokAccount(id).then((a) => {
      setAccount(a)
      setForm({
        tiktok_id: a.tiktok_id, status: a.status, account_level: a.account_level, account_created_on: a.account_created_on || '',
        device_id: a.device_id ?? '', room_id: a.room_id ?? '', location_id: a.location_id ?? '',
        password: a.password, twofa: a.twofa, email: a.email, email_password: a.email_password,
      })
    }).catch(() => setAccount(false))
  }, [id, isNew])

  const set = (key) => (e) => { setSaved(false); setForm((f) => ({ ...f, [key]: e.target.value })) }
  const rooms = useMemo(() => structure.filter((l) => !form.location_id || String(l.id) === String(form.location_id)).flatMap((l) => l.rooms), [structure, form.location_id])
  const devices = useMemo(() => rooms.filter((r) => !form.room_id || String(r.id) === String(form.room_id)).flatMap((r) => r.devices.map((d) => ({ ...d, label: `${d.name} (${r.name})` }))), [rooms, form.room_id])

  // Picking a device fills in its room and location (they can still be changed independently afterwards).
  function pickDevice(e) {
    const deviceId = e.target.value
    setSaved(false)
    if (!deviceId) { setForm((f) => ({ ...f, device_id: '' })); return }
    for (const l of structure) for (const r of l.rooms) if (r.devices.some((d) => String(d.id) === deviceId)) {
      setForm((f) => ({ ...f, device_id: deviceId, room_id: String(r.id), location_id: String(l.id) }))
      return
    }
  }

  const canSeeSecrets = isNew ? true : account?.can_see_credentials

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = {
      tiktok_id: form.tiktok_id, status: form.status, account_level: Number(form.account_level) || 0,
      account_created_on: form.account_created_on || null,
      device_id: toId(form.device_id), room_id: toId(form.room_id), location_id: toId(form.location_id),
    }
    if (canSeeSecrets) Object.assign(body, { password: form.password, twofa: form.twofa, email: form.email, email_password: form.email_password })
    try {
      if (isNew) {
        const res = await createTikTokAccount(body)
        navigate(`/tiktok/accounts/${res.id}`, { replace: true })
      } else {
        await updateTikTokAccount(id, body)
        setSaved(true)
        setAccount(await getTikTokAccount(id))
      }
    } catch (err) {
      setError(err.response?.data?.error || t('page_tiktok.save_error'))
    } finally {
      setBusy(false)
    }
  }

  async function submitNote() {
    if (!note.trim()) return
    try {
      const n = await addTikTokNote(id, note)
      setAccount((a) => ({ ...a, notes: [...a.notes, n] }))
      setNote('')
    } catch (err) {
      setError(err.response?.data?.error || t('page_tiktok.save_error'))
    }
  }

  async function removeNote(n) {
    if (!window.confirm(t('page_tiktok.delete_note_confirm'))) return
    try {
      await deleteTikTokNote(id, n.id)
      setAccount((a) => ({ ...a, notes: a.notes.filter((x) => x.id !== n.id) }))
    } catch (err) {
      setError(err.response?.data?.error || t('page_tiktok.save_error'))
    }
  }

  if (account === false) return <div className="p-8 text-center text-gray-500">{t('page_tiktok.not_found')}</div>
  if (!isNew && !account) return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={() => navigate('/tiktok/accounts')} className="text-sm font-semibold text-brand-600 hover:underline">← {t('page_tiktok.back')}</button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{isNew ? t('page_tiktok.add_account') : `@${account.tiktok_id}`}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t('page_tiktok.details_subtitle')}</p>
        </div>
        {!isNew && <StatusBadge status={account.status} />}
      </div>

      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!canEdit} className={`${cardClasses} p-4 space-y-3`}>
          <h2 className="font-bold text-[var(--text-primary)]">{t('page_tiktok.account_info')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="TikTok ID"><input value={form.tiktok_id} onChange={set('tiktok_id')} required className={inputCls} /></Field>
            <Field label={t('page_tiktok.status')}>
              <select value={form.status} onChange={set('status')} className={inputCls}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </Field>
            <Field label={t('page_tiktok.account_level')}><input type="number" min="0" value={form.account_level} onChange={set('account_level')} className={inputCls} /></Field>
            <Field label={t('page_tiktok.created_at')}><DateInput value={form.account_created_on} onChange={(v) => { setSaved(false); setForm((f) => ({ ...f, account_created_on: v })) }} className={inputCls} /></Field>
            <Field label={t('page_tiktok.device')}>
              <select value={form.device_id} onChange={pickDevice} className={inputCls}>
                <option value="">{t('page_tiktok.unassigned')}</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
            <Field label={t('page_tiktok.location')}>
              <select value={form.location_id} onChange={(e) => { setSaved(false); setForm((f) => ({ ...f, location_id: e.target.value, room_id: '', device_id: '' })) }} className={inputCls}>
                <option value="">{t('page_tiktok.unassigned')}</option>
                {structure.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label={t('page_tiktok.room')}>
              <select value={form.room_id} onChange={(e) => { setSaved(false); setForm((f) => ({ ...f, room_id: e.target.value, device_id: '' })) }} className={inputCls}>
                <option value="">{t('page_tiktok.unassigned')}</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{t('page_tiktok.optional_hint')}</p>
        </fieldset>

        <fieldset disabled={!canEdit} className={`${cardClasses} p-4 space-y-3`}>
          <h2 className="font-bold text-[var(--text-primary)]">{t('page_tiktok.login_info')}</h2>
          {canSeeSecrets ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('page_tiktok.password')}><input type={showSecrets ? 'text' : 'password'} autoComplete="off" value={form.password} onChange={set('password')} className={inputCls} /></Field>
                <Field label="2FA"><input type={showSecrets ? 'text' : 'password'} autoComplete="off" value={form.twofa} onChange={set('twofa')} className={inputCls} /></Field>
                <Field label="Email"><input type={showSecrets ? 'text' : 'password'} autoComplete="off" value={form.email} onChange={set('email')} className={inputCls} /></Field>
                <Field label={t('page_tiktok.email_password')}><input type={showSecrets ? 'text' : 'password'} autoComplete="off" value={form.email_password} onChange={set('email_password')} className={inputCls} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} />{t('page_tiktok.show_sensitive')}</label>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">{t('page_tiktok.credentials_restricted')}</p>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-600">{t('page_tiktok.saved')}</span>}
            <button type="button" onClick={() => navigate('/tiktok/accounts')} className="border border-gray-300 text-[var(--text-primary)] text-sm font-semibold px-4 py-2 rounded-lg">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_tiktok.save_changes')}</button>
          </div>
        )}
      </form>

      {!isNew && (
        <div className={`${cardClasses} p-4 space-y-3`}>
          <h2 className="font-bold text-[var(--text-primary)]">{t('page_tiktok.notes')}</h2>
          {account.notes.length === 0 && <p className="text-sm text-gray-400">{t('page_tiktok.no_notes')}</p>}
          <ul className="space-y-2">
            {account.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-[var(--table-header-bg)] p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm whitespace-pre-wrap text-[var(--text-primary)]">{n.body}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">{n.author} · {new Date(n.created_at).toLocaleString()}</p>
                </div>
                {canEdit && <button type="button" onClick={() => removeNote(n)} className="shrink-0 text-xs font-semibold text-red-600 hover:underline">{t('common.delete')}</button>}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('page_tiktok.note_ph')} className={inputCls} />
              <div className="text-right"><button type="button" onClick={submitNote} disabled={!note.trim()} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">+ {t('page_tiktok.add_note')}</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
