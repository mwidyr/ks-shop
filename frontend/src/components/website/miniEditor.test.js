// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { blockToDoc, docToListBlock, docToParagraphBlock, emptyBlock } from '../../utils/articleBlocks'

// Same configuration as TextBlock in ArticleBlockEditor.jsx.
function make(kind, block) {
  return new Editor({
    element: document.createElement('div'),
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
  })
}

describe('text block mini editor', () => {
  it('loads a formatted paragraph and gives the same block back', () => {
    const ed = make('p', { type: 'p', text: 'Hello world', html: 'Hello <strong>world</strong>' })
    expect(docToParagraphBlock(ed.getJSON())).toEqual({ text: 'Hello world', html: 'Hello <strong>world</strong>' })
  })
  it('an empty new paragraph block is a valid document', () => {
    const ed = make('p', emptyBlock('p'))
    expect(docToParagraphBlock(ed.getJSON()).text).toBe('')
  })
  it('typing, bold and a link produce the stored html', () => {
    const ed = make('p', emptyBlock('p'))
    ed.commands.insertContent('Hi there')
    ed.chain().selectAll().toggleBold().run()
    expect(docToParagraphBlock(ed.getJSON())).toEqual({ text: 'Hi there', html: '<strong>Hi there</strong>' })
    ed.chain().selectAll().setLink({ href: 'https://a.com' }).run()
    expect(docToParagraphBlock(ed.getJSON()).html).toBe('<a href="https://a.com"><strong>Hi there</strong></a>')
  })
  it('a line break keeps everything in one paragraph', () => {
    const ed = make('p', emptyBlock('p'))
    ed.commands.insertContent('a')
    ed.commands.setHardBreak()
    ed.commands.insertContent('b')
    expect(ed.getJSON().content.length).toBe(1)
    expect(docToParagraphBlock(ed.getJSON()).text).toBe('a\nb')
  })
  it('bullet and numbered list blocks load and convert', () => {
    const bl = make('list', { type: 'list', items: ['a', 'b'] })
    expect(docToListBlock(bl.getJSON())).toEqual({ items: ['a', 'b'], items_html: undefined })
    const nl = make('olist', { type: 'olist', items: ['x'], items_html: ['<em>x</em>'] })
    expect(docToListBlock(nl.getJSON())).toEqual({ items: ['x'], items_html: ['<em>x</em>'] })
  })
  it('a new list block starts with one empty item and can take text', () => {
    const ed = make('list', emptyBlock('list'))
    ed.commands.insertContent('first')
    expect(docToListBlock(ed.getJSON()).items).toEqual(['first'])
    ed.commands.splitListItem('listItem')
    ed.commands.insertContent('second')
    expect(docToListBlock(ed.getJSON()).items).toEqual(['first', 'second'])
  })
})
