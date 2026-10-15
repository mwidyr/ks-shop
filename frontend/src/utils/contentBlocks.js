// Converts between the stored article blocks ({type: h2|h3|p|list|olist|image|product|tags, ...}) and
// the Tiptap document the visual editor works on. Inline formatting (bold / italic / link) is stored in
// an `html` field next to the plain `text` (`items_html` next to `items` for lists); the backend
// sanitises it again (content_blocks.go), the storefront renders it through DOMPurify.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

// ---- inline: Tiptap paragraph content <-> { text, html }
export function inlineToStored(content = []) {
  let text = ''
  let html = ''
  let formatted = false
  content.forEach((n) => {
    if (n.type === 'hardBreak') { text += '\n'; html += '<br>'; return }
    if (n.type !== 'text') return
    text += n.text
    let chunk = esc(n.text)
    const marks = n.marks || []
    const link = marks.find((m) => m.type === 'link')
    if (marks.some((m) => m.type === 'bold')) { chunk = `<strong>${chunk}</strong>`; formatted = true }
    if (marks.some((m) => m.type === 'italic')) { chunk = `<em>${chunk}</em>`; formatted = true }
    if (link?.attrs?.href) { chunk = `<a href="${esc(link.attrs.href)}">${chunk}</a>`; formatted = true }
    html += chunk
  })
  return { text, html: formatted ? html : '' }
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g
export function htmlToInline(html = '') {
  const out = []
  const marks = []
  let last = 0
  let m
  const pushText = (raw) => {
    const text = unesc(raw)
    if (!text) return
    const node = { type: 'text', text }
    if (marks.length) node.marks = marks.map((x) => ({ ...x, ...(x.attrs ? { attrs: { ...x.attrs } } : {}) }))
    out.push(node)
  }
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(html))) {
    pushText(html.slice(last, m.index))
    last = TAG_RE.lastIndex
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    const mark = tag === 'strong' || tag === 'b' ? { type: 'bold' } : tag === 'em' || tag === 'i' ? { type: 'italic' } : null
    if (tag === 'br') { out.push({ type: 'hardBreak' }); continue }
    if (tag === 'a') {
      if (closing) { const i = marks.map((x) => x.type).lastIndexOf('link'); if (i >= 0) marks.splice(i, 1) } else {
        const href = (m[3].match(/href\s*=\s*"([^"]*)"/i) || [])[1]
        if (href) marks.push({ type: 'link', attrs: { href: unesc(href) } })
      }
      continue
    }
    if (mark) {
      if (closing) { const i = marks.map((x) => x.type).lastIndexOf(mark.type); if (i >= 0) marks.splice(i, 1) } else marks.push(mark)
    }
  }
  pushText(html.slice(last))
  return out
}

function textToInline(text = '') {
  const out = []
  String(text).split('\n').forEach((line, i) => {
    if (i > 0) out.push({ type: 'hardBreak' })
    if (line) out.push({ type: 'text', text: line })
  })
  return out
}

const paragraph = (content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
const TAGS_LINE = /^(#[^\s#]+\s*)+$/

// ---- stored blocks -> Tiptap doc
export function blocksToDoc(blocks = []) {
  const content = []
  blocks.forEach((b) => {
    const inline = () => (b.html ? htmlToInline(b.html) : textToInline(b.text))
    switch (b.type) {
      case 'h2': content.push({ type: 'heading', attrs: { level: 2 }, content: b.text ? [{ type: 'text', text: b.text }] : undefined }); break
      case 'h3': content.push({ type: 'heading', attrs: { level: 3 }, content: b.text ? [{ type: 'text', text: b.text }] : undefined }); break
      case 'list':
      case 'olist': {
        const items = b.items || []
        content.push({
          type: b.type === 'olist' ? 'orderedList' : 'bulletList',
          content: items.map((x, i) => ({ type: 'listItem', content: [paragraph(b.items_html?.[i] ? htmlToInline(b.items_html[i]) : textToInline(x))] })),
        })
        break
      }
      case 'image': content.push({ type: 'image', attrs: { src: b.url, alt: b.alt || '' } }); break
      case 'product': content.push({ type: 'productCard', attrs: { productId: b.product_id } }); break
      case 'products': (b.product_ids || []).forEach((id) => content.push({ type: 'productCard', attrs: { productId: id } })); break
      case 'tags': content.push(paragraph([{ type: 'text', text: (b.items || []).map((x) => `#${x}`).join(' ') }])); break
      default: content.push(paragraph(inline()))
    }
  })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

// ---- Tiptap doc -> stored blocks
export function docToBlocks(doc) {
  const blocks = []
  const plain = (n) => (n.content || []).map((c) => (c.type === 'hardBreak' ? '\n' : c.text || '')).join('')
  ;(doc?.content || []).forEach((n) => {
    switch (n.type) {
      case 'heading': {
        const text = plain(n).trim()
        if (text) blocks.push({ type: n.attrs?.level === 3 ? 'h3' : 'h2', text })
        break
      }
      case 'paragraph': {
        const { text, html } = inlineToStored(n.content)
        if (!text.trim()) break
        if (TAGS_LINE.test(text.trim()) && !html) blocks.push({ type: 'tags', items: text.trim().split(/\s+/).map((x) => x.replace(/^#/, '')) })
        else blocks.push(html ? { type: 'p', text, html } : { type: 'p', text })
        break
      }
      case 'bulletList':
      case 'orderedList': {
        const items = []
        const itemsHtml = []
        let formatted = false
        ;(n.content || []).forEach((li) => {
          const paras = (li.content || []).filter((c) => c.type === 'paragraph')
          const joined = paras.flatMap((p, i) => (i ? [{ type: 'hardBreak' }, ...(p.content || [])] : p.content || []))
          const { text, html } = inlineToStored(joined)
          if (!text.trim()) return
          items.push(text)
          itemsHtml.push(html || esc(text))
          if (html) formatted = true
        })
        if (items.length) blocks.push({ type: n.type === 'orderedList' ? 'olist' : 'list', items, ...(formatted ? { items_html: itemsHtml } : {}) })
        break
      }
      case 'image': if (n.attrs?.src) blocks.push({ type: 'image', url: n.attrs.src, alt: n.attrs.alt || '' }); break
      case 'productCard': if (n.attrs?.productId) blocks.push({ type: 'product', product_id: Number(n.attrs.productId) }); break
      default: break
    }
  })
  return blocks
}

export const productIdsInBlocks = (blocks = []) => [...new Set(blocks.filter((b) => b.type === 'product').map((b) => b.product_id))]
