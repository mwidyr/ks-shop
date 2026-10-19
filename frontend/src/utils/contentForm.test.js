import { describe, it, expect } from 'vitest'
import { buildPayload, loadForm, publishProblems, slugify, snapshotOf, typeLabel, EMPTY_FORM } from './contentForm'

describe('contentForm', () => {
  it('slugify makes url-safe slugs', () => {
    expect(slugify('5 ide outfit simpel untuk kerja!')).toBe('5-ide-outfit-simpel-untuk-kerja')
    expect(slugify('Café Été')).toBe('cafe-ete')
  })
  it('loadForm converts old list / tags blocks and keeps the rest', () => {
    const { form, blocks } = loadForm({
      id: 3, lang: 'id', tags: ['a'], title: { id: 'T' }, summary: { id: 'intro' },
      body: { id: [{ type: 'p', text: 'x' }, { type: 'list', items: ['a'] }, { type: 'tags', items: ['b', 'a'] }] },
      draft: { x: 1 }, draft_saved_at: 'now',
    })
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p'])
    expect(form.tags).toEqual(['a', 'b'])
    expect(form.draft).toBeUndefined()
    expect(form.summary.id).toBe('intro')
  })
  it('buildPayload derives summary + intro_html from the introduction and drops empty blocks / volatile fields', () => {
    const form = { ...EMPTY_FORM, lang: 'en', title: { en: 'T' }, product_ids: [1], updated_at: 'x', draft_saved_at: 'y' }
    const blocks = [{ id: 'a', type: 'h2', text: 'H' }, { id: 'b', type: 'p', text: '' }, { id: 'c', type: 'product', product_id: 7 }]
    const p = buildPayload(form, blocks, { text: ' Hello ', html: '<p>Hello <u>x</u></p>' })
    expect(p.summary).toEqual({ en: 'Hello' })
    expect(p.intro_html).toEqual({ en: '<p>Hello <u>x</u></p>' })
    expect(p.body.en.map((b) => b.type)).toEqual(['h2', 'product'])
    expect(p.product_ids).toEqual([1, 7])
    expect(p.updated_at).toBeUndefined()
  })
  it('the snapshot changes when the content changes and not otherwise', () => {
    const form = { ...EMPTY_FORM, title: { id: 'T' } }
    const a = snapshotOf(form, [{ id: '1', type: 'h2', text: 'A' }], { text: '', html: '' })
    expect(snapshotOf(form, [{ id: '2', type: 'h2', text: 'A' }], { text: '', html: '' })).toBe(a) // ids do not count
    expect(snapshotOf(form, [{ id: '1', type: 'h2', text: 'B' }], { text: '', html: '' })).not.toBe(a)
  })
  it('publish needs title, a valid slug and, for host journals, a host', () => {
    expect(publishProblems({ ...EMPTY_FORM })).toEqual(['title', 'slug'])
    expect(publishProblems({ ...EMPTY_FORM, title: { id: 'T' }, slug: 'ok-1', type: 'host_article' })).toEqual(['host'])
    expect(publishProblems({ ...EMPTY_FORM, title: { id: 'T' }, slug: 'ok-1' })).toEqual([])
  })
  it('type label falls back through the languages', () => {
    expect(typeLabel({ slug: 's', names: { en: 'Topic' } }, 'id')).toBe('Topic')
    expect(typeLabel({ slug: 's', names: {} }, 'id')).toBe('s')
  })
})
