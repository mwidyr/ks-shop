// Category page mosaic (#146). Sections hold five slots; the website hides empty ones and re-flows the rest so the
// grid never shows holes. Desktop is a 4-column grid, phones 2 columns.

// Spans for the last, partly filled row so it still reaches both edges: 3 cards on 4 columns -> 2+1+1.
function fillRow(count, cols) {
  const base = Math.floor(cols / count)
  const extra = cols % count
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))
}

// Cells of a plain flow (all_small, or a large template without its large card).
function flow(cards, cols) {
  const rest = cards.length % cols
  const full = cards.length - rest
  const last = rest ? fillRow(rest, cols) : []
  return cards.map((card, i) => ({ card, style: { gridColumn: `span ${i >= full ? last[i - full] : 1}` } }))
}

// template: large_left | large_right | all_small; slots: five cards or null. Returns [{ card, style }] in render order.
export function mosaicCells(template, slots, desktop) {
  const cols = desktop ? 4 : 2
  const big = template !== 'all_small' ? slots[0] : null
  const smalls = (template === 'all_small' ? slots : slots.slice(1)).filter(Boolean)
  if (!big) return flow(smalls, cols)
  const n = smalls.length
  if (!desktop) {
    return [{ card: big, style: { gridColumn: '1 / span 2', gridRow: 'span 2' } }, ...flow(smalls, 2)]
  }
  const bigCol = template === 'large_left' ? 1 : 3
  const sc = template === 'large_left' ? 3 : 1
  const out = [{ card: big, style: { gridColumn: n === 0 ? '1 / span 4' : `${bigCol} / span 2`, gridRow: '1 / span 2' } }]
  smalls.forEach((card, i) => {
    let style
    if (n === 1) style = { gridColumn: `${sc} / span 2`, gridRow: '1 / span 2' }
    else if (n === 2) style = { gridColumn: `${sc} / span 2`, gridRow: `${i + 1}` }
    else if (n === 3 && i === 2) style = { gridColumn: `${sc} / span 2`, gridRow: '2' }
    else style = { gridColumn: `${sc + (i % 2)}`, gridRow: `${Math.floor(i / 2) + 1}` }
    out.push({ card, style })
  })
  return out
}
