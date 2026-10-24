import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addCustomerNote, updateCustomerNote, deleteCustomerNote } from '../api/customers'

// Internal notes on a customer profile (#138): added one by one, editable and deletable - the same
// log as Purchase Requisition supplier notes. Read-only without edit access to Customers.
export default function CustomerNotes({ customerId, notes, canEdit, onChanged }) {
  const { t } = useTranslation()
  const n = (k) => t(`page_customers.detail.notes_${k}`)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  async function run(fn) {
    setError('')
    try { await fn(); onChanged() } catch (err) { setError(err.response?.data?.error || n('save_failed')) }
  }
  const add = (e) => { e.preventDefault(); if (!draft.trim()) return; run(async () => { await addCustomerNote(customerId, draft.trim()); setDraft('') }) }
  const save = (id) => { if (!editText.trim()) return; run(async () => { await updateCustomerNote(id, editText.trim()); setEditingId(null) }) }
  const remove = (id) => { if (window.confirm(n('delete_confirm'))) run(() => deleteCustomerNote(id)) }

  return (
    <div className="mb-6 space-y-2">
      <h3 className="text-sm font-bold text-[var(--text-primary)]">{n('title')}</h3>
      {canEdit && (
        <form onSubmit={add} className="flex flex-col gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={n('placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={!draft.trim()} className="self-end bg-gray-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-40">{n('add')}</button>
        </form>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">{n('empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li key={note.id} className="text-sm border border-[var(--table-divider)] rounded-lg px-3 py-2">
              {editingId === note.id ? (
                <div className="flex flex-col gap-2">
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  <div className="flex gap-3 justify-end text-xs">
                    <button type="button" onClick={() => save(note.id)} className="font-semibold text-brand-600 hover:underline">{t('common.save')}</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:underline">{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[var(--text-primary)] whitespace-pre-line break-words">{note.note}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {note.created_by_name} · {new Date(note.created_at).toLocaleString()}
                      {note.updated_at !== note.created_at && ` · ${n('edited')}`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-3 shrink-0 text-xs">
                      <button type="button" onClick={() => { setEditingId(note.id); setEditText(note.note) }} className="text-gray-500 hover:text-brand-600">{n('edit')}</button>
                      <button type="button" onClick={() => remove(note.id)} className="text-gray-400 hover:text-red-600">{n('delete')}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
