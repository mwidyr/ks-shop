import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteContentTemplate, getContentTemplate, listContentTemplates, updateContentTemplate } from '../../api/website'
import { toEditorBlocks, toStoredBlocks } from '../../utils/articleBlocks'
import { modernizeBlocks } from '../../utils/richText'
import ArticleBlockEditor from './ArticleBlockEditor'
import { btnCls, btnGhost, cardCls, inputCls } from './Pickers'

// List, rename, edit (with the same block editor as articles) and delete saved templates. Editing a template
// never changes the articles that were made from it: applying a template copies its blocks.
export default function TemplateManager({ onClose, onChanged }) {
  const { t } = useTranslation()
  const e = (k, o) => t(`page_website.content.ed.${k}`, o)
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null) // { id, name, blocks }
  const [err, setErr] = useState('')
  const load = () => listContentTemplates().then(setList).catch(() => {})
  useEffect(() => { load() }, [])
  const fail = (ex) => setErr(ex.response?.data?.error || t('page_website.common.error'))

  async function open(id) {
    setErr('')
    const tpl = await getContentTemplate(id)
    setEditing({ id, name: tpl.name, blocks: modernizeBlocks(toEditorBlocks(tpl.blocks || [])).blocks })
  }
  async function save() {
    try {
      await updateContentTemplate(editing.id, editing.name, toStoredBlocks(editing.blocks))
      setEditing(null); setErr(''); load(); onChanged?.()
    } catch (ex) { fail(ex) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className={`${cardCls} w-full max-w-3xl my-6 space-y-4`} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold text-gray-800">{e('templates_title')}</h2><button type="button" onClick={onClose} className={btnGhost}>{e('close')}</button></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {editing ? (
          <div className="space-y-3">
            <input value={editing.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} className={inputCls} placeholder={e('template_name')} />
            <ArticleBlockEditor blocks={editing.blocks} onChange={(blocks) => setEditing((cur) => ({ ...cur, blocks }))} />
            <div className="flex gap-2"><button type="button" onClick={save} disabled={!editing.name.trim()} className={btnCls}>{t('page_website.common.save')}</button><button type="button" onClick={() => setEditing(null)} className={btnGhost}>{e('cancel')}</button></div>
          </div>
        ) : list.length === 0 ? <p className="text-sm text-gray-500">{e('templates_empty')}</p> : (
          <ul className="divide-y">
            {list.map((row) => (
              <li key={row.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-sm"><b>{row.name}</b> <span className="text-xs text-gray-400">· {e('templates_blocks', { count: row.block_count })}</span></span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => open(row.id)} className={btnGhost}>{e('edit')}</button>
                  <button type="button" onClick={() => { if (window.confirm(e('template_delete_confirm'))) deleteContentTemplate(row.id).then(() => { load(); onChanged?.() }).catch(fail) }} className={`${btnGhost} text-red-600`}>{e('delete')}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
