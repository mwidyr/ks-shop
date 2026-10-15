import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { resolveUrl, uploadImageFile } from '../../utils/image'
import { ProductSearch, useProductList } from './Pickers'

// Product card inside the article: stored as { type: 'product', product_id } (see utils/contentBlocks.js).
function ProductCardView({ node, deleteNode, selected }) {
  const { t } = useTranslation()
  const products = useProductList()
  const p = products.find((x) => x.id === Number(node.attrs.productId))
  const price = p ? Math.min(...(p.variants || []).filter((v) => v.is_active !== false).map((v) => Number(v.price) || 0)) : null
  return (
    <NodeViewWrapper className={`my-3 flex items-center gap-3 rounded-xl border bg-white p-2.5 ${selected ? 'border-brand-600 ring-2 ring-brand-100' : 'border-gray-200'}`} contentEditable={false} data-drag-handle>
      {p?.images?.[0]?.url ? <img src={resolveUrl(p.images[0].url)} alt="" className="h-14 w-11 rounded-lg object-cover bg-gray-100" /> : <div className="h-14 w-11 rounded-lg bg-gray-100" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-brand-600">{t('page_website.content.editor.product_card')}{p?.sku ? ` · ${p.sku}` : ''}</p>
        <p className="truncate text-sm font-semibold text-gray-800">{p ? p.name : `#${node.attrs.productId}`}</p>
        {Number.isFinite(price) && <p className="text-xs text-gray-500">NT$ {price.toLocaleString('en-US')}</p>}
      </div>
      <button type="button" onClick={deleteNode} className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">{t('page_website.content.editor.remove')}</button>
    </NodeViewWrapper>
  )
}

const ProductCard = Node.create({
  name: 'productCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { productId: { default: null } } },
  parseHTML() { return [{ tag: 'div[data-product-card]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-product-card': '' })] },
  addNodeView() { return ReactNodeViewRenderer(ProductCardView) },
})

// The editor shows uploaded images next to the API origin, the document keeps the raw /uploads path.
const ArticleImage = Image.extend({
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes, { src: resolveUrl(HTMLAttributes.src) })] },
})

const Btn = ({ active, onClick, title, children, disabled }) => (
  <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={`min-w-8 h-8 px-2 rounded-lg text-sm font-semibold border ${active ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-40`}>{children}</button>
)

// Visual editor for the article body. `value` is a Tiptap document (blocksToDoc), `onChange(doc)` gets
// the document on every edit. Remount it (key) to load another article.
export default function RichBodyEditor({ value, onChange }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const [pickProduct, setPickProduct] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } } }),
      ArticleImage.configure({ inline: false }),
      ProductCard,
    ],
    content: value,
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON()),
    editorProps: { attributes: { class: 'rich-body min-h-[320px] px-4 py-3 outline-none' } },
  })
  if (!editor) return null

  function setLink() {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt(e('link_prompt'), prev)
    if (url === null) return
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  async function onFile(ev) {
    const f = ev.target.files[0]
    ev.target.value = ''
    if (!f) return
    setUploading(true); setErr('')
    try {
      const src = await uploadImageFile(f)
      editor.chain().focus().setImage({ src, alt: '' }).run()
    } catch { setErr(e('upload_failed')) } finally { setUploading(false) }
  }

  return (
    <div className="rounded-xl border border-gray-300 bg-white">
      <style>{`
        .rich-body > * + * { margin-top: .75rem }
        .rich-body h2 { font-size: 1.25rem; font-weight: 700 }
        .rich-body h3 { font-size: 1.05rem; font-weight: 700 }
        .rich-body ul { list-style: disc; padding-left: 1.4rem }
        .rich-body ol { list-style: decimal; padding-left: 1.4rem }
        .rich-body a { color: #2563eb; text-decoration: underline }
        .rich-body img { max-width: 100%; height: auto; border-radius: 12px }
        .rich-body img.ProseMirror-selectednode { outline: 2px solid #2563eb }
        .rich-body p { line-height: 1.7 }
      `}</style>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-2 rounded-t-xl sticky top-0 z-10">
        <Btn title={e('h2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
        <Btn title={e('h3')} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
        <Btn title={e('bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
        <Btn title={e('italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
        <Btn title={e('bullet')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• {e('list')}</Btn>
        <Btn title={e('ordered')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. {e('list')}</Btn>
        <Btn title={e('link')} active={editor.isActive('link')} onClick={setLink}>{e('link')}</Btn>
        <Btn title={e('image')} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '…' : e('image')}</Btn>
        <Btn title={e('product')} active={pickProduct} onClick={() => setPickProduct((v) => !v)}>{e('product')}</Btn>
        <span className="mx-1 h-5 w-px bg-gray-300" />
        <Btn title={e('undo')} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↶</Btn>
        <Btn title={e('redo')} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↷</Btn>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      </div>
      {pickProduct && (
        <div className="border-b border-gray-200 bg-amber-50/60 px-3 py-2.5">
          <p className="mb-1.5 text-xs text-gray-600">{e('pick_product_hint')}</p>
          <ProductSearch placeholder={e('pick_product')} onPick={(p) => { editor.chain().focus().insertContent({ type: 'productCard', attrs: { productId: p.id } }).run(); setPickProduct(false) }} />
        </div>
      )}
      {err && <p className="px-3 pt-2 text-xs text-red-600">{err}</p>}
      <EditorContent editor={editor} />
    </div>
  )
}
