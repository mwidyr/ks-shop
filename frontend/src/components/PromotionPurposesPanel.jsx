import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPromotionPurpose, listPromotionPurposes, reorderPromotionPurposes, updatePromotionPurpose } from '../api/promotions'
import { useCanEdit } from '../context/AccessContext'
import { describeError } from '../utils/errorText'

// Promotion Management > Purpose Settings: the options CS picks from when applying a promotion. Add, rename, reorder and
// disable. Nothing is deleted, and every usage record keeps the name the purpose had when it was used.
export default function PromotionPurposesPanel() {
  const { t } = useTranslation()
  const pt = (k, o) => t(`page_promotions.${k}`, o)
  const canEdit = useCanEdit('promotions')
  const [list, setList] = useState([])
  const [names, setNames] = useState({})
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function reload() {
    return listPromotionPurposes(false).then((rows) => { setList(rows); setNames(Object.fromEntries(rows.map((p) => [p.id, p.name]))) })
  }
  useEffect(() => { reload().catch(() => {}) }, [])

  async function run(fn) {
    setError(''); setBusy(true)
    try { await fn(); await reload() } catch (e) { setError(describeError(e, pt('purposes_save_failed'))) } finally { setBusy(false) }
  }
  const rename = (p) => {
    const name = (names[p.id] || '').trim()
    if (name === p.name) return
    if (!name) { setNames((n) => ({ ...n, [p.id]: p.name })); return }
    run(() => updatePromotionPurpose(p.id, { name }))
  }
  const move = (index, delta) => {
    const ids = list.map((p) => p.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    run(() => reorderPromotionPurposes(ids))
  }
  const add = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    run(async () => { await createPromotionPurpose(newName.trim()); setNewName('') })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-800">{pt('purposes_title')}</h2>
        <p className="text-xs text-gray-500">{pt('purposes_hint')}</p>
      </div>
      <ul className="divide-y">
        {list.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-3 py-2 ${p.is_active ? '' : 'opacity-60'}`}>
            <div className="flex flex-col">
              <button type="button" disabled={!canEdit || busy || i === 0} onClick={() => move(i, -1)} aria-label={pt('purposes_up')} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none">▲</button>
              <button type="button" disabled={!canEdit || busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label={pt('purposes_down')} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none">▼</button>
            </div>
            <input
              value={names[p.id] ?? p.name}
              disabled={!canEdit || busy}
              maxLength={80}
              onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))}
              onBlur={() => rename(p)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              aria-label={pt('purposes_name')}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm disabled:bg-gray-50"
            />
            {p.is_system && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700" title={pt('purposes_system_hint')}>{pt('purposes_system')}</span>}
            <span className="text-xs text-gray-400 w-20 text-right">{pt('purposes_used', { count: p.usage_count })}</span>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={p.is_active} disabled={!canEdit || busy || p.is_system} onChange={(e) => run(() => updatePromotionPurpose(p.id, { is_active: e.target.checked }))} className="w-4 h-4" />
              {pt('purposes_enabled')}
            </label>
          </li>
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-gray-400">{pt('empty_state')}</li>}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder={pt('purposes_new_placeholder')} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <button type="submit" disabled={busy || !newName.trim()} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-lg">{pt('purposes_add')}</button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
