import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createContentType, deleteContentType, listContentTypes, updateContentType } from '../../api/website'
import { LANGS, typeLabel } from '../../utils/contentForm'
import { btnCls, btnGhost, cardCls, inputCls } from './Pickers'

// Create, rename and delete content types (Topic, Article, Host Journal and the ones staff add, e.g. Outfit Guide).
// Built-in types and types that articles use cannot be deleted. onChanged() tells the editor to reload the type list.
export default function ContentTypeManager({ onClose, onChanged }) {
  const { t, i18n } = useTranslation()
  const e = (k, o) => t(`page_website.content.ed.${k}`, o)
  const [types, setTypes] = useState([])
  const [edit, setEdit] = useState({}) // id -> names being typed
  const [fresh, setFresh] = useState({})
  const [err, setErr] = useState('')
  const load = () => listContentTypes().then((l) => { setTypes(l); setEdit({}) }).catch(() => {})
  useEffect(() => { load() }, [])
  const fail = (ex) => setErr(ex.response?.data?.error || t('page_website.common.error'))
  const done = () => { setErr(''); load(); onChanged?.() }

  const names = (row) => edit[row.id] || row.names
  const nameInputs = (value, set) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {LANGS.map((l) => (
        <input key={l} value={value[l] || ''} placeholder={t(`page_website.common.language_${l}`)} onChange={(ev) => set({ ...value, [l]: ev.target.value })} className={inputCls} />
      ))}
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className={`${cardCls} w-full max-w-3xl my-6 space-y-4`} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold text-gray-800">{e('types_title')}</h2><button type="button" onClick={onClose} className={btnGhost}>{e('close')}</button></div>
        <p className="text-xs text-gray-500">{e('types_hint')}</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <ul className="space-y-3">
          {types.map((row) => (
            <li key={row.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{typeLabel(row, i18n.language)} <span className="text-xs font-normal text-gray-400">· {row.slug} · {e('types_used', { count: row.used_count })}{row.is_system ? ` · ${e('types_system')}` : ''}</span></span>
                <span className="flex gap-2">
                  <button type="button" disabled={!edit[row.id]} onClick={() => updateContentType(row.id, edit[row.id]).then(done).catch(fail)} className={btnGhost}>{t('page_website.common.save')}</button>
                  <button type="button" disabled={row.is_system || row.used_count > 0} title={row.is_system ? e('types_system') : row.used_count > 0 ? e('types_in_use') : ''}
                    onClick={() => { if (window.confirm(e('types_delete_confirm'))) deleteContentType(row.id).then(done).catch(fail) }} className={`${btnGhost} text-red-600 disabled:opacity-40`}>{e('delete')}</button>
                </span>
              </div>
              {nameInputs(names(row), (v) => setEdit((cur) => ({ ...cur, [row.id]: v })))}
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-dashed border-gray-300 p-3 space-y-2">
          <p className="text-sm font-semibold">{e('types_new')}</p>
          {nameInputs(fresh, setFresh)}
          <button type="button" disabled={!Object.values(fresh).some((v) => String(v).trim())} onClick={() => createContentType(fresh).then(() => { setFresh({}); done() }).catch(fail)} className={btnCls}>{e('types_add')}</button>
        </div>
      </div>
    </div>
  )
}
