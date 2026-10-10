// Right-aligns NUMERIC values in data tables (client item 100) without touching every page:
// a table cell whose whole text is a number / amount / percentage gets the `num-cell` class
// (right-aligned, tabular digits - see index.html). Text, dates, labels, phone numbers (leading 0),
// codes and column headers are left alone, as are cells that already set their own alignment
// (text-left/center/right, e.g. the Heatmap grid and the stock numbers) or hold form controls.

const PREFIX = /^(NT\$|US\$|Rp\.?|\$|¥)\s?/
const SUFFIX = /\s?(%|pcs|PCS)$/
const GROUPED = /^\d{1,3}([.,]\d{3})+([.,]\d+)?$/
const PLAIN = /^\d+([.,]\d+)?$/

export function isNumericText(raw) {
  let s = raw.replace(/ /g, ' ').trim()
  if (!s || s.length > 24) return false
  let decorated = false
  s = s.replace(/^[-+−]\s?/, () => { decorated = true; return '' })
  s = s.replace(PREFIX, () => { decorated = true; return '' })
  s = s.replace(/^[-+−]\s?/, () => { decorated = true; return '' })
  s = s.replace(SUFFIX, () => { decorated = true; return '' })
  if (GROUPED.test(s)) return true
  if (!PLAIN.test(s)) return false
  // Bare digit strings: phone numbers / codes start with 0 or are long - those are not quantities.
  if (!decorated && !/[.,]/.test(s) && ((s.length > 1 && s[0] === '0') || s.length > 9)) return false
  return true
}

const HAS_OWN_ALIGN = /(^|\s)text-(left|center|right)(\s|$)/
const HAS_CONTROL = 'input,select,textarea,button'

function mark(td) {
  if (td.classList.contains('num-cell')) return
  if (HAS_OWN_ALIGN.test(td.className) || td.querySelector(HAS_CONTROL)) return
  if (isNumericText(td.textContent || '')) td.classList.add('num-cell')
}

function unmark(td) {
  if (td.classList.contains('num-cell') && !isNumericText(td.textContent || '')) td.classList.remove('num-cell')
}

function check(td) {
  if (td.classList.contains('num-cell')) unmark(td)
  else mark(td)
}

export function startNumericCellAlignment() {
  const pending = new Set()
  let scheduled = false
  const flush = () => {
    scheduled = false
    pending.forEach((td) => { if (td.isConnected) check(td) })
    pending.clear()
  }
  const queue = (td) => {
    pending.add(td)
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
  }
  const collect = (node) => {
    if (node.nodeType === 3) node = node.parentElement
    if (!node || node.nodeType !== 1) return
    const td = node.closest('td')
    if (td) { queue(td); return }
    node.querySelectorAll?.('td').forEach(queue)
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(collect)
      if (m.type === 'childList' || m.type === 'characterData') collect(m.target)
      if (m.type === 'attributes' && m.target.tagName === 'TD') queue(m.target)
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  document.querySelectorAll('td').forEach(queue)
}
