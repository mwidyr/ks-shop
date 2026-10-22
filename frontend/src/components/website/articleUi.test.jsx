// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) }) }))
vi.mock('../../api/products', () => ({ listProducts: () => Promise.resolve([{ id: 3, name: 'Silk Blouse', sku: 'SB-1', images: [{ url: '/uploads/a.jpg' }], variants: [{ price: 900, is_active: true }, { price: 700, is_active: true }] }]) }))
vi.mock('../../utils/image', () => ({ resolveUrl: (u) => u, uploadImageFile: () => Promise.resolve('/uploads/new.jpg') }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import ArticleBlockEditor from './ArticleBlockEditor'
import ArticlePreview from './ArticlePreview'
import { duplicateBlock, toEditorBlocks, toStoredBlocks } from '../../utils/articleBlocks'
import { modernizeBlocks } from '../../utils/richText'

const sample = [
  { type: 'h2', text: 'Alpha' }, { type: 'p', text: 'Intro text', html: 'Intro <strong>text</strong>' },
  { type: 'h2', text: 'Beta' }, { type: 'list', items: ['a', 'b'] }, { type: 'product', product_id: 3 },
  { type: 'image', url: '/uploads/x.jpg', alt: 'x', caption: 'Cap' },
]

async function mount(el, node) {
  const root = createRoot(el)
  await act(async () => { root.render(node) })
  await act(async () => { await Promise.resolve() })
  return root
}

describe('ArticleBlockEditor', () => {
  function Harness({ initial, spy }) {
    const [blocks, setBlocks] = useState(initial)
    spy.get = () => blocks
    return <ArticleBlockEditor blocks={blocks} onChange={setBlocks} />
  }
  it('renders every block, moves and deletes them, keeps the order', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const spy = {}
    await mount(el, <Harness initial={toEditorBlocks(sample)} spy={spy} />)
    expect(el.querySelectorAll('[data-placeholder="page_website.content.editor.h2_placeholder"]').length).toBe(2)
    expect(el.textContent).toContain('Silk Blouse')
    expect(el.textContent).toContain('page_website.content.editor.toc_title')
    const down = [...el.querySelectorAll('button[aria-label="page_website.content.editor.move_down"]')]
    await act(async () => { down[0].click() }) // move "Alpha" below the paragraph
    expect(toStoredBlocks(spy.get()).map((b) => b.type)).toEqual(['p', 'h2', 'h2', 'list', 'product', 'image'])
    const up = [...el.querySelectorAll('button[aria-label="page_website.content.editor.move_up"]')]
    expect(up[0].disabled).toBe(true) // first block can't go up
    await act(async () => { up[2].click() })
    expect(toStoredBlocks(spy.get()).map((b) => b.type)).toEqual(['p', 'h2', 'h2', 'list', 'product', 'image'].map((t, i, a) => (i === 1 ? a[2] : i === 2 ? a[1] : t)))
    window.confirm = () => true
    const del = [...el.querySelectorAll('button[aria-label="page_website.content.editor.delete_block"]')]
    await act(async () => { del[5].click() })
    expect(toStoredBlocks(spy.get()).map((b) => b.type).includes('image')).toBe(false)
  })
  it('adds a block between two blocks', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const spy = {}
    await mount(el, <Harness initial={toEditorBlocks([{ type: 'p', text: 'one' }, { type: 'p', text: 'two' }])} spy={spy} />)
    const add = [...el.querySelectorAll('button')].filter((b) => b.textContent.includes('page_website.content.editor.add_block'))
    expect(add.length).toBe(3)
    await act(async () => { add[1].click() })
    const h2 = [...el.querySelectorAll('button')].find((b) => b.textContent === 'page_website.content.editor.type_h2')
    await act(async () => { h2.click() })
    expect(spy.get().map((b) => b.type)).toEqual(['p', 'h2', 'p'])
  })
  it('an empty article offers the first block', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const spy = {}
    await mount(el, <Harness initial={[]} spy={spy} />)
    const p = [...el.querySelectorAll('button')].find((b) => b.textContent === 'page_website.content.editor.type_p')
    await act(async () => { p.click() })
    expect(spy.get().map((b) => b.type)).toEqual(['p'])
  })
})

describe('ArticlePreview', () => {
  const stored = toStoredBlocks(toEditorBlocks(sample)).map((b, i) => ({ ...b, id: `pv${i}` }))
  it('renders the table of contents right under the introduction, before every body block (even a leading paragraph)', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    await mount(el, <ArticlePreview title="My title" introHtml="<p>Opening words</p>" blocks={stored} type="article" tags={['x']} onClose={() => {}} />)
    const text = el.textContent
    expect(text).toContain('My title')
    const toc = text.indexOf('page_website.content.preview.toc')
    expect(text.indexOf('Opening words')).toBeLessThan(toc)
    expect(toc).toBeLessThan(text.indexOf('Intro text')) // the first paragraph block comes AFTER the table of contents
    expect(toc).toBeLessThan(text.indexOf('Alpha', toc + 5))
    expect(text.indexOf('Alpha', toc + 5)).toBeLessThan(text.indexOf('Beta', toc + 5))
    expect(text).toContain('Silk Blouse')
    expect(text).toContain('NT$700')
    expect(text).toContain('Cap')
    expect(el.querySelector('strong').textContent).toBe('text')
  })
  it('shows no table of contents with fewer than two H2 headings, nor for topics', async () => {
    const one = stored.filter((b) => b.text !== 'Beta')
    const el = document.createElement('div'); document.body.appendChild(el)
    await mount(el, <ArticlePreview title="t" blocks={one} type="article" onClose={() => {}} />)
    expect(el.textContent).not.toContain('page_website.content.preview.toc')
    const el2 = document.createElement('div'); document.body.appendChild(el2)
    await mount(el2, <ArticlePreview title="t" blocks={stored} type="topic" onClose={() => {}} />)
    expect(el2.textContent).not.toContain('page_website.content.preview.toc')
  })
  it('does not render a dangerous link', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    await mount(el, <ArticlePreview title="t" type="article" onClose={() => {}} blocks={[{ id: 'a', type: 'p', text: 'x', html: '<a href="javascript:alert(1)">x</a>' }]} />)
    expect(el.innerHTML).not.toContain('javascript:')
  })
})

describe('five block types, tools and legacy blocks', () => {
  it('converts old list / tags blocks to a Text block and article tags', () => {
    const { blocks, tags } = modernizeBlocks(toEditorBlocks([
      { type: 'list', items: ['a', 'b'], items_html: ['a', '<em>b</em>'] }, { type: 'olist', items: ['x'] }, { type: 'tags', items: ['spring', 'sale'] }, { type: 'h2', text: 'T' },
    ]))
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p', 'h2'])
    expect(blocks[0].html).toBe('<ul><li><p>a</p></li><li><p><em>b</em></p></li></ul>')
    expect(blocks[1].html).toBe('<ol><li><p>x</p></li></ol>')
    expect(tags).toEqual(['spring', 'sale'])
  })
  it('duplicates a block right after itself with a new id', () => {
    const blocks = toEditorBlocks([{ type: 'h2', text: 'A' }, { type: 'p', text: 'B' }])
    const next = duplicateBlock(blocks, 0)
    expect(next.map((b) => b.text)).toEqual(['A', 'A', 'B'])
    expect(next[1].id).not.toBe(next[0].id)
  })
  it('the add menu offers exactly H2, H3, Text, Image, Product', async () => {
    const { BLOCK_TYPES } = await import('../../utils/articleBlocks')
    expect(BLOCK_TYPES).toEqual(['h2', 'h3', 'p', 'image', 'product'])
  })
})
