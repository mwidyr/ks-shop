import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Node } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { resolveUrl, uploadImageFile } from '../../utils/image'
import {
  BLOCK_TYPES, blockToDoc, docToListBlock, docToParagraphBlock, emptyBlock, insertBlock, moveBlock, safeHrefValue, tocFromBlocks, showToc,
} from '../../utils/articleBlocks'
import { ProductSearch, useProductList } from './Pickers'

const iconBtn = 'min-w-8 h-8 px-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent'
const fieldCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'

// ---- one text / list block = a tiny Tiptap that only knows bold, italic and links ----------------
// The document is forced to exactly one paragraph (text) or exactly one list, so a block can never
// turn into something else; Enter inside a text block adds a line break instead of a new paragraph.
function TextBlock({ block, onChange }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const kind = block.type
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false, heading: false, blockquote: false, codeBlock: false, horizontalRule: false, code: false, strike: false, underline: false,
        trailingNode: false, dropcursor: false, gapcursor: false,
        bulletList: kind === 'list' ? {} : false, orderedList: kind === 'olist' ? {} : false, listItem: kind === 'p' ? false : {}, listKeymap: kind === 'p' ? false : {},
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } },
      }),
      Node.create({ name: 'doc', topNode: true, content: kind === 'list' ? 'bulletList' : kind === 'olist' ? 'orderedList' : 'paragraph' }),
    ],
    content: blockToDoc(block),
    onUpdate: ({ editor: ed }) => onChange(kind === 'p' ? docToParagraphBlock(ed.getJSON()) : docToListBlock(ed.getJSON())),
    editorProps: {
      attributes: { class: 'article-block-text min-h-[64px] px-3 py-2 outline-none' },
      handleKeyDown: (view, ev) => {
        if (kind === 'p' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); return editor?.commands.setHardBreak() ?? false }
        return false
      },
    },
  })
  if (!editor) return null

  function setLink() {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt(e('link_prompt'), prev)
    if (url === null) return
    const clean = safeHrefValue(url)
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (!clean) window.alert(e('link_invalid'))
    else editor.chain().focus().extendMarkRange('link').setLink({ href: clean }).run()
  }
  const Tb = ({ active, onClick, title, children }) => (
    <button type="button" title={title} aria-label={title} onMouseDown={(ev) => ev.preventDefault()} onClick={onClick}
      className={`min-w-7 h-7 px-1.5 rounded-md text-xs font-semibold border ${active ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{children}</button>
  )
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1.5 bg-gray-50 rounded-t-lg">
        <Tb title={e('bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Tb>
        <Tb title={e('italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Tb>
        <Tb title={e('link')} active={editor.isActive('link')} onClick={setLink}>{e('link')}</Tb>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function ImageBlock({ block, onChange }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  async function onFile(ev) {
    const f = ev.target.files[0]
    ev.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { onChange({ url: await uploadImageFile(f) }) } catch { setErr(e('upload_failed')) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {block.url ? <img src={resolveUrl(block.url)} alt="" className="h-24 w-24 rounded-lg object-cover bg-gray-100" /> : <div className="h-24 w-24 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">{e('no_image')}</div>}
        <div className="space-y-1.5">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">{busy ? '…' : block.url ? e('replace_image') : e('upload_image')}</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
      <input value={block.alt || ''} onChange={(ev) => onChange({ alt: ev.target.value })} placeholder={e('alt_placeholder')} className={fieldCls} />
      <input value={block.caption || ''} onChange={(ev) => onChange({ caption: ev.target.value })} placeholder={e('caption_placeholder')} className={fieldCls} />
    </div>
  )
}

function ProductBlock({ block, onChange }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const products = useProductList()
  const p = products.find((x) => x.id === Number(block.product_id))
  const price = p ? Math.min(...(p.variants || []).filter((v) => v.is_active !== false).map((v) => Number(v.price) || 0)) : null
  return (
    <div className="space-y-2">
      {block.product_id ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-2.5">
          {p?.images?.[0]?.url ? <img src={resolveUrl(p.images[0].url)} alt="" className="h-14 w-11 rounded-lg object-cover bg-gray-100" /> : <div className="h-14 w-11 rounded-lg bg-gray-100" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-800">{p ? p.name : `#${block.product_id}`}</p>
            <p className="text-xs text-gray-500">{p?.sku}{Number.isFinite(price) ? ` · NT$ ${price.toLocaleString('en-US')}` : ''}</p>
          </div>
          <button type="button" onClick={() => onChange({ product_id: null })} className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">{e('change')}</button>
        </div>
      ) : (
        <ProductSearch placeholder={e('pick_product')} onPick={(x) => onChange({ product_id: x.id })} />
      )}
    </div>
  )
}

function TagsBlock({ block, onChange }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const [text, setText] = useState((block.items || []).join(', '))
  return (
    <input value={text} onChange={(ev) => { setText(ev.target.value); onChange({ items: ev.target.value.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean) }) }}
      placeholder={e('tags_placeholder')} className={fieldCls} />
  )
}

function HeadingBlock({ block, onChange }) {
  const { t } = useTranslation()
  return (
    <input value={block.text || ''} onChange={(ev) => onChange({ text: ev.target.value })} placeholder={t(`page_website.content.editor.${block.type}_placeholder`)}
      className={`${fieldCls} ${block.type === 'h2' ? 'text-lg font-bold' : 'text-base font-bold'}`} />
  )
}

function BlockBody({ block, onChange }) {
  switch (block.type) {
    case 'h2':
    case 'h3': return <HeadingBlock block={block} onChange={onChange} />
    case 'image': return <ImageBlock block={block} onChange={onChange} />
    case 'product': return <ProductBlock block={block} onChange={onChange} />
    case 'tags': return <TagsBlock block={block} onChange={onChange} />
    default: return <TextBlock block={block} onChange={onChange} />
  }
}

// "+ Add block" between two blocks: opens a small menu of block types.
function AddBlock({ onAdd, alwaysOpen }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(Boolean(alwaysOpen))
  const ref = useRef(null)
  useEffect(() => {
    if (!open || alwaysOpen) return undefined
    const close = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, alwaysOpen])
  return (
    <div ref={ref} className="flex flex-col items-center py-1">
      {!alwaysOpen && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full border border-dashed border-gray-300 px-3 py-0.5 text-xs font-semibold text-gray-500 hover:border-brand-600 hover:text-brand-600">
          + {t('page_website.content.editor.add_block')}
        </button>
      )}
      {open && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {BLOCK_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => { onAdd(type); if (!alwaysOpen) setOpen(false) }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {t(`page_website.content.editor.type_${type}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The article body as a list of blocks. `blocks` are editor blocks (utils/articleBlocks.js); every change
// calls onChange(nextBlocks). Blocks keep their `id` while they move, so their editor state is kept.
export default function ArticleBlockEditor({ blocks, onChange }) {
  const { t } = useTranslation()
  const e = (k, o) => t(`page_website.content.editor.${k}`, o)
  const patch = (id, change) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...change } : b)))
  const toc = tocFromBlocks(blocks)

  return (
    <div className="space-y-1">
      {toc.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <p className="font-semibold">{e('toc_title')} {!showToc(toc) && <span className="font-normal text-gray-400">· {e('toc_needs_two')}</span>}</p>
          <ol className="list-decimal list-inside mt-1 space-y-0.5">{toc.map((x) => <li key={x.i}>{x.text}</li>)}</ol>
        </div>
      )}
      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-6 text-center">
          <p className="text-sm text-gray-500 mb-1">{e('empty_article')}</p>
          <AddBlock alwaysOpen onAdd={(type) => onChange([emptyBlock(type)])} />
        </div>
      ) : (
        <>
          <AddBlock onAdd={(type) => onChange(insertBlock(blocks, 0, emptyBlock(type)))} />
          {blocks.map((b, i) => (
            <div key={b.id}>
              <div className="rounded-xl border border-gray-300 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-600">{e(`type_${b.type}`)}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" className={iconBtn} disabled={i === 0} title={e('move_up')} aria-label={e('move_up')} onClick={() => onChange(moveBlock(blocks, i, i - 1))}>↑</button>
                    <button type="button" className={iconBtn} disabled={i === blocks.length - 1} title={e('move_down')} aria-label={e('move_down')} onClick={() => onChange(moveBlock(blocks, i, i + 1))}>↓</button>
                    <button type="button" className={`${iconBtn} text-red-600`} title={e('delete_block')} aria-label={e('delete_block')}
                      onClick={() => { if (window.confirm(e('delete_block_confirm'))) onChange(blocks.filter((x) => x.id !== b.id)) }}>✕</button>
                  </span>
                </div>
                <BlockBody block={b} onChange={(change) => patch(b.id, change)} />
              </div>
              <AddBlock onAdd={(type) => onChange(insertBlock(blocks, i + 1, emptyBlock(type)))} />
            </div>
          ))}
        </>
      )}
      <style>{`
        .article-block-text > * + * { margin-top: .5rem }
        .article-block-text p { line-height: 1.7 }
        .article-block-text ul { list-style: disc; padding-left: 1.4rem }
        .article-block-text ol { list-style: decimal; padding-left: 1.4rem }
        .article-block-text a { color: #2563eb; text-decoration: underline }
      `}</style>
    </div>
  )
}
