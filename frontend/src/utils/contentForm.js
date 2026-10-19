// Pure helpers of the article editor form (pages/WebsiteContent.jsx -> components/website/ContentEditor.jsx).
import { toEditorBlocks, toStoredBlocks, tocFromBlocks } from './articleBlocks'
import { productIdsInBlocks } from './contentBlocks'
import { modernizeBlocks } from './richText'

export const LANGS = ['id', 'en', 'zh', 'vi']
// per-language text fields: when the article's language changes, the text typed so far moves to the new key
export const TEXT_KEYS = ['title', 'summary', 'intro_html', 'category_label', 'cover_alt']
export const EMPTY_FORM = {
  type: 'article', slug: '', lang: 'id', title: {}, summary: {}, intro_html: {}, body: {}, category_label: {}, cover_alt: {}, cover_url: '', author_host_id: null, author_name: '', read_minutes: null,
  tags: [], seo_title: {}, seo_description: {}, canonical_url: '', is_published: false, is_indexed: true, is_featured: false, product_ids: [], category_ids: [], host_ids: [],
}

export const slugify = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

// A DTO from the API (or a saved draft snapshot) -> { form, blocks } for the editor. Old list / tags blocks become
// Text blocks / article tags.
export function loadForm(dto) {
  const lang = dto.lang || 'id'
  const { blocks, tags } = modernizeBlocks(toEditorBlocks(dto.body?.[lang] || []))
  const form = {
    ...EMPTY_FORM, ...dto,
    title: dto.title || {}, summary: dto.summary || {}, intro_html: dto.intro_html || {}, category_label: dto.category_label || {}, cover_alt: dto.cover_alt || {},
    tags: [...new Set([...(dto.tags || []), ...tags])],
    product_ids: dto.product_ids || [], category_ids: dto.category_ids || [], host_ids: dto.host_ids || [],
  }
  delete form.draft
  delete form.draft_saved_at
  return { form, blocks }
}

// The API payload for the current form + blocks. `intro` is the editor value { text, html } of the introduction;
// summary keeps its plain text (previews, meta description), intro_html the formatted version.
export function buildPayload(form, blocks, intro) {
  const lang = form.lang
  const stored = toStoredBlocks(blocks)
  const productIds = [...new Set([...(form.product_ids || []), ...productIdsInBlocks(stored)])]
  const summary = intro ? { [lang]: (intro.text || '').trim() } : form.summary
  const introHtml = intro ? { [lang]: intro.html || '' } : form.intro_html
  const { draft, draft_saved_at: _d, updated_at: _u, ...rest } = form // eslint-disable-line no-unused-vars
  return {
    ...rest, summary, intro_html: introHtml, body: { [lang]: stored }, product_ids: productIds,
    read_minutes: form.read_minutes === '' ? null : form.read_minutes,
  }
}

// What "unsaved changes" compares: the payload, without volatile fields.
export const snapshotOf = (form, blocks, intro) => {
  // id / publish state / dates are not content: saving or publishing must not make the form look edited
  const { id, is_published, published_at, draft_saved_at, updated_at, ...content } = buildPayload(form, blocks, intro) // eslint-disable-line no-unused-vars
  return JSON.stringify(content)
}

// Problems that stop Publish / Update (Save Draft only needs a title and a valid slug).
export function publishProblems(form) {
  const lang = form.lang
  const out = []
  if (!(form.title?.[lang] || '').trim()) out.push('title')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug || '')) out.push('slug')
  if (form.type === 'host_article' && !form.author_host_id) out.push('host')
  return out
}

// The table of contents shown in the editor: H2 headings in block order.
export const tocOf = (blocks) => tocFromBlocks(blocks)

// The label of a content type in the admin's language.
export const typeLabel = (t, lang) => t?.names?.[lang] || t?.names?.en || t?.names?.id || t?.slug || ''
