import { describe, it, expect } from 'vitest'
import {
  blockToDoc, docToListBlock, docToParagraphBlock, emptyBlock, insertBlock, moveBlock, safeHrefValue, safeInlineHtml,
  showToc, toEditorBlocks, toStoredBlocks, tocFromBlocks,
} from './articleBlocks'

const stored = [
  { type: 'h2', text: 'One' },
  { type: 'p', text: 'Hello world', html: 'Hello <strong>world</strong>' },
  { type: 'list', items: ['a', 'b'], items_html: ['a', '<em>b</em>'] },
  { type: 'image', url: '/uploads/x.jpg', alt: 'x' },
  { type: 'products', product_ids: [3, 4] },
  { type: 'h2', text: 'Two' },
  { type: 'tags', items: ['spring', 'sale'] },
]

describe('stored <-> editor blocks', () => {
  it('adds ids and expands the legacy products block', () => {
    const e = toEditorBlocks(stored)
    expect(e.length).toBe(8)
    expect(e.every((b) => b.id)).toBe(true)
    expect(e.filter((b) => b.type === 'product').map((b) => b.product_id)).toEqual([3, 4])
  })
  it('round-trips without losing formatting', () => {
    const back = toStoredBlocks(toEditorBlocks(stored))
    expect(back).toEqual([
      ...stored.slice(0, 4),
      { type: 'product', product_id: 3 },
      { type: 'product', product_id: 4 },
      ...stored.slice(5),
    ])
  })
  it('keeps the order of the blocks', () => {
    expect(toStoredBlocks(toEditorBlocks(stored)).map((b) => b.type)).toEqual(['h2', 'p', 'list', 'image', 'product', 'product', 'h2', 'tags'])
  })
  it('drops empty blocks and the client ids on save', () => {
    const blocks = [emptyBlock('p'), emptyBlock('h2'), emptyBlock('list'), emptyBlock('image'), emptyBlock('product'), emptyBlock('tags'),
      { ...emptyBlock('h3'), text: ' Hi ' }]
    expect(toStoredBlocks(blocks)).toEqual([{ type: 'h3', text: 'Hi' }])
  })
  it('untyped legacy blocks become paragraphs', () => {
    expect(toEditorBlocks([{ text: 'old' }])[0].type).toBe('p')
  })
})

describe('mini-editor conversion', () => {
  it('paragraph with bold survives', () => {
    const doc = blockToDoc({ type: 'p', text: 'Hello world', html: 'Hello <strong>world</strong>' })
    expect(docToParagraphBlock(doc)).toEqual({ text: 'Hello world', html: 'Hello <strong>world</strong>' })
  })
  it('a hashtag-looking paragraph stays a paragraph', () => {
    expect(docToParagraphBlock(blockToDoc({ type: 'p', text: '#a #b' }))).toEqual({ text: '#a #b', html: undefined })
  })
  it('list items and their formatting survive', () => {
    const doc = blockToDoc({ type: 'olist', items: ['a', 'b'], items_html: ['a', '<em>b</em>'] })
    expect(doc.content[0].type).toBe('orderedList')
    expect(docToListBlock(doc)).toEqual({ items: ['a', 'b'], items_html: ['a', '<em>b</em>'] })
  })
})

describe('reordering', () => {
  const l = ['a', 'b', 'c']
  it('moves down and up', () => {
    expect(moveBlock(l, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveBlock(l, 2, 1)).toEqual(['a', 'c', 'b'])
  })
  it('ignores moves past the ends', () => {
    expect(moveBlock(l, 0, -1)).toBe(l)
    expect(moveBlock(l, 2, 3)).toBe(l)
  })
  it('inserts between blocks', () => {
    expect(insertBlock(l, 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
  })
})

describe('table of contents', () => {
  it('lists the H2 headings with their position, skipping empty ones', () => {
    expect(tocFromBlocks([{ type: 'h2', text: 'A' }, { type: 'p' }, { type: 'h3', text: 'sub' }, { type: 'h2', text: ' ' }, { type: 'h2', text: 'B' }]))
      .toEqual([{ i: 0, text: 'A' }, { i: 4, text: 'B' }])
  })
  it('is shown from two headings, like the website', () => {
    expect(showToc([{ i: 0, text: 'A' }])).toBe(false)
    expect(showToc([{ i: 0, text: 'A' }, { i: 1, text: 'B' }])).toBe(true)
  })
})

describe('link safety', () => {
  it('allows http(s), mailto, tel and site paths only', () => {
    expect(safeHrefValue('https://a.com')).toBe('https://a.com')
    expect(safeHrefValue('/style')).toBe('/style')
    expect(safeHrefValue('javascript:alert(1)')).toBe('')
    expect(safeHrefValue('//evil.com')).toBe('')
  })
  it('strips bad hrefs and unknown tags from preview html', () => {
    expect(safeInlineHtml('<a href="javascript:x()">hi</a>')).toBe('<a>hi</a>')
    expect(safeInlineHtml('<script>x</script><strong>ok</strong>')).toBe('x<strong>ok</strong>')
    expect(safeInlineHtml('<a href="https://a.com/?a=1&amp;b=2">go</a>')).toContain('href="https://a.com/?a=1&amp;b=2"')
  })
})
