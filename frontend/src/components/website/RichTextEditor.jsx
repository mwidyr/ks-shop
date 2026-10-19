import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Node } from '@tiptap/core'
import { safeHrefValue } from '../../utils/articleBlocks'
import { headingHtml, htmlForEditor, storedFromHtml } from '../../utils/richText'

// The one small editor behind every formatted field of an article:
//   mode "heading" (H2 / H3): one line; Bold, Italic, Underline, Link
//   mode "text" (Text block, Introduction): paragraphs; Bold, Italic, Underline, Link, Bullet list, Numbered list
// `value` is a block-like { text, html } (only read when the editor is created: blocks keep their id
// while they move, so the editor state is kept); every change calls onChange({ text, html }).
const tbBtn = (active) => `min-w-7 h-7 px-1.5 rounded-md text-xs font-semibold border ${active ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`

export default function RichTextEditor({ value, onChange, mode = 'text', placeholder = '', className = '' }) {
  const { t } = useTranslation()
  const e = (k) => t(`page_website.content.editor.${k}`)
  const heading = mode === 'heading'
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false, heading: false, blockquote: false, codeBlock: false, horizontalRule: false, code: false, strike: false,
        trailingNode: false, dropcursor: false, gapcursor: false,
        underline: {},
        bulletList: heading ? false : {}, orderedList: heading ? false : {}, listItem: heading ? false : {}, listKeymap: heading ? false : {},
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } },
      }),
      Node.create({ name: 'doc', topNode: true, content: heading ? 'paragraph' : 'block+' }),
    ],
    content: htmlForEditor(value || {}, { heading }),
    onUpdate: ({ editor: ed }) => {
      const html = heading ? headingHtml(ed.getHTML()) : ed.getHTML()
      const text = ed.getText({ blockSeparator: '\n' })
      const stored = heading ? { text, html: /<[a-z]/i.test(html) ? html : '' } : storedFromHtml(html, text)
      onChangeRef.current(stored)
    },
    editorProps: {
      attributes: { class: `article-block-text px-3 py-2 outline-none ${heading ? 'min-h-[40px]' : 'min-h-[64px]'} ${className}`, ...(placeholder ? { 'data-placeholder': placeholder } : {}) },
      handleKeyDown: (view, ev) => (heading && ev.key === 'Enter' ? (ev.preventDefault(), true) : false),
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
    <button type="button" title={title} aria-label={title} onMouseDown={(ev) => ev.preventDefault()} onClick={onClick} className={tbBtn(active)}>{children}</button>
  )
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1.5 bg-gray-50 rounded-t-lg flex-wrap">
        <Tb title={e('bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Tb>
        <Tb title={e('italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Tb>
        <Tb title={e('underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Tb>
        <Tb title={e('link')} active={editor.isActive('link')} onClick={setLink}>{e('link')}</Tb>
        {!heading && <Tb title={e('bullet')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• {e('bullet_short')}</Tb>}
        {!heading && <Tb title={e('ordered')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. {e('bullet_short')}</Tb>}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
