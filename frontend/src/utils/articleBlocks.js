// Helpers of the block-based article editor. An article body is an array of stored blocks
// ({type: p|h2|h3|list|olist|image|product|tags, ...}, see contentBlocks.js and the backend's
// cleanBodyBlocks). While editing, every block also carries a client-only `id` so React can keep
// its editor state when blocks move; the ids are stripped before saving.
import { blocksToDoc, docToBlocks, inlineToStored } from './contentBlocks'

let counter = 0
export const newId = () => `b${Date.now().toString(36)}${(counter += 1)}`

export const BLOCK_TYPES = ['p', 'h2', 'h3', 'list', 'olist', 'image', 'product', 'tags']

// A fresh, empty block of a type.
export function emptyBlock(type) {
  switch (type) {
    case 'h2':
    case 'h3': return { id: newId(), type, text: '' }
    case 'p': return { id: newId(), type, text: '' }
    case 'list':
    case 'olist': return { id: newId(), type, items: [''] }
    case 'image': return { id: newId(), type, url: '', alt: '', caption: '' }
    case 'product': return { id: newId(), type, product_id: null }
    case 'tags': return { id: newId(), type, items: [] }
    default: return { id: newId(), type: 'p', text: '' }
  }
}

// Stored blocks -> editor blocks: adds ids, turns the legacy `products` block (several products in
// one block) into one `product` block each, and gives untyped blocks the `p` type.
export function toEditorBlocks(stored = []) {
  const out = []
  stored.forEach((b) => {
    if (b.type === 'products') (b.product_ids || []).forEach((pid) => out.push({ id: newId(), type: 'product', product_id: pid }))
    else out.push({ ...b, type: b.type || 'p', id: newId() })
  })
  return out
}

const hasText = (s) => String(s || '').trim() !== ''

// Editor blocks -> blocks to store: drops the client ids and every block that is still empty.
export function toStoredBlocks(blocks = []) {
  const out = []
  blocks.forEach(({ id, ...b }) => {
    switch (b.type) {
      case 'h2':
      case 'h3': if (hasText(b.text)) out.push({ type: b.type, text: b.text.trim() }); break
      case 'p': if (hasText(b.text)) out.push(b.html ? { type: 'p', text: b.text, html: b.html } : { type: 'p', text: b.text }); break
      case 'list':
      case 'olist': {
        const keep = []
        ;(b.items || []).forEach((it, i) => { if (hasText(it)) keep.push(i) })
        if (keep.length) {
          const block = { type: b.type, items: keep.map((i) => b.items[i]) }
          if (b.items_html?.length) block.items_html = keep.map((i) => b.items_html[i] || b.items[i])
          out.push(block)
        }
        break
      }
      case 'image': if (hasText(b.url)) out.push({ type: 'image', url: b.url.trim(), alt: b.alt || '', ...(hasText(b.caption) ? { caption: b.caption.trim() } : {}) }); break
      case 'product': if (b.product_id) out.push({ type: 'product', product_id: Number(b.product_id) }); break
      case 'tags': {
        const items = (b.items || []).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean)
        if (items.length) out.push({ type: 'tags', items })
        break
      }
      default: break
    }
  })
  return out
}

// ---- mini-editor <-> block conversion (text and list blocks are edited with a tiny Tiptap each)
export function blockToDoc(block) {
  return blocksToDoc([block])
}

// The paragraph block of a one-paragraph document. (Not docToBlocks: that turns a "#a #b" line into
// a tags block, which would silently change what the staff typed.)
export function docToParagraphBlock(doc) {
  const { text, html } = inlineToStored(doc?.content?.[0]?.content || [])
  return html ? { text, html } : { text, html: undefined }
}

export function docToListBlock(doc) {
  const b = docToBlocks(doc).find((x) => x.type === 'list' || x.type === 'olist')
  return b ? { items: b.items, items_html: b.items_html } : { items: [], items_html: undefined }
}

// ---- reordering
export function moveBlock(blocks, from, to) {
  if (to < 0 || to >= blocks.length || from === to) return blocks
  const next = [...blocks]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function insertBlock(blocks, index, block) {
  const next = [...blocks]
  next.splice(index, 0, block)
  return next
}

// ---- table of contents: the H2 headings, the same rule the website uses (shown from two headings up)
export function tocFromBlocks(blocks = []) {
  return blocks.map((b, i) => (b.type === 'h2' && hasText(b.text) ? { i, text: b.text.trim() } : null)).filter(Boolean)
}
export const MIN_TOC_HEADINGS = 2
export const showToc = (toc) => toc.length >= MIN_TOC_HEADINGS

// Only these link targets are allowed in article text (same set the backend keeps).
export function safeHrefValue(raw) {
  const u = String(raw || '').trim()
  const l = u.toLowerCase()
  if (l.startsWith('http://') || l.startsWith('https://') || l.startsWith('mailto:') || l.startsWith('tel:')) return u
  if (u.startsWith('/') && !u.startsWith('//')) return u
  return ''
}

// Drops every href that is not allowed from stored inline html (used by the preview, which renders
// unsaved text).
export function safeInlineHtml(html = '') {
  return String(html)
    .replace(/<(?!\/?(?:strong|em|br|a)\b)[^>]*>/gi, '')
    .replace(/<a\b([^>]*)>/gi, (m, attrs) => {
      const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || [])[1]
      const ok = href && safeHrefValue(href.replace(/&amp;/g, '&'))
      return ok ? `<a href="${href}" rel="noopener" target="_blank">` : '<a>'
    })
}
