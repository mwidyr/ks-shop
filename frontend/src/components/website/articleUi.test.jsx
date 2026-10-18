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
import { toEditorBlocks, toStoredBlocks } from '../../utils/articleBlocks'

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
    expect(el.querySelectorAll('input[placeholder="page_website.content.editor.h2_placeholder"]').length).toBe(2)
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
  it('renders the blocks in order with the table of contents after the first paragraph', async () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    await mount(el, <ArticlePreview title="My title" blocks={stored} type="article" tags={['x']} onClose={() => {}} />)
    const text = el.textContent
    expect(text).toContain('My title')
    expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('Intro text'))
    expect(text.indexOf('Intro text')).toBeLessThan(text.indexOf('page_website.content.preview.toc'))
    expect(text.indexOf('page_website.content.preview.toc')).toBeLessThan(text.indexOf('Beta', text.indexOf('preview.toc') + 5))
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
