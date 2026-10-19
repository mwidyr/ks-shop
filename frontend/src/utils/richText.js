// Helpers of the rich text fields of the article editor (H2 / H3 / Text blocks, the introduction).
// A field is stored as the plain `text` plus, when it has formatting, an `html` string that the
// backend sanitises again (content_blocks.go: sanitizeRichHTML / sanitizeInlineHTML).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Editor html -> what is stored. `html` is '' when the field is just plain text (one paragraph, no marks),
// so unformatted blocks stay as small as before.
export function storedFromHtml(editorHtml, plainText) {
  const html = String(editorHtml || '')
  const single = html.match(/^<p>([\s\S]*)<\/p>$/)
  const inner = single && !/<\/?p>/.test(single[1]) ? single[1] : null
  if (inner !== null && !/<[a-z]/i.test(inner)) return { text: plainText, html: '' } // plain, no marks / breaks
  return { text: plainText, html }
}

// A heading holds one line: <p>…</p> -> … (inline html only).
export const headingHtml = (editorHtml) => String(editorHtml || '').replace(/^<p>([\s\S]*)<\/p>$/, '$1')

// The html to put into the editor for a stored field: its html, or the escaped plain text.
export function htmlForEditor(block, { heading = false } = {}) {
  if (block.html) return heading ? `<p>${block.html}</p>` : (/<(p|ul|ol)\b/i.test(block.html) ? block.html : `<p>${block.html}</p>`)
  const lines = String(block.text || '').split('\n').map(esc)
  return heading ? `<p>${lines.join('<br>')}</p>` : `<p>${lines.join('<br>')}</p>`
}

// A legacy bullet / numbered list block -> one Text block that holds the list.
export function listBlockToText(b) {
  const tag = b.type === 'olist' ? 'ol' : 'ul'
  const items = (b.items || []).map((x, i) => `<li><p>${b.items_html?.[i] || esc(x)}</p></li>`).join('')
  return { type: 'p', text: (b.items || []).join('\n'), html: `<${tag}>${items}</${tag}>` }
}

// Editor blocks with the removed block types converted: list / olist -> Text block, tags -> returned
// separately (they become article tags).
export function modernizeBlocks(blocks = []) {
  const out = []
  const tags = []
  blocks.forEach((b) => {
    if (b.type === 'list' || b.type === 'olist') out.push({ ...listBlockToText(b), id: b.id })
    else if (b.type === 'tags') (b.items || []).forEach((x) => tags.push(x))
    else out.push(b)
  })
  return { blocks: out, tags }
}
