// Pixel-parity runner: every in-scope design artboard (docs/storefront-design/*.dc.html) vs the matching
// storefront page, rendered at the artboard's own size.
//
//   cd scripts/parity && npm install
//   STORE_URL=http://localhost:5190 node run.mjs              # all entries
//   STORE_URL=... node run.mjs Main Cart --verbose             # only these artboards
//
// The storefront must be running (vite dev or a static build). The API is NOT needed: every /api/ call is
// answered by fixtures.mjs, so each page renders exactly the artboard's data. Photos are replaced by the same
// flat grey on both sides (the artboards' /_blob/ files are not available), animations are off and the clock is
// frozen. Output: out/<id>.png (reference | app | diff) and out/report.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { manifest } from './manifest.mjs'
import { apiFor } from './fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const DESIGN = path.resolve(here, '../../docs/storefront-design')
const OUT = path.join(here, 'out')
const STORE = process.env.STORE_URL || 'http://localhost:5190'
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const THRESHOLD = Number(process.env.PARITY_MAX_PCT || 0.5)
const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const geoFlag = args.includes('--geo')
const only = args.filter((a) => !a.startsWith('--'))

const NEUTRAL_CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
video { visibility: hidden !important; }
::-webkit-scrollbar { display: none !important; } html { scrollbar-width: none !important; }
`
// every <img> (present now or added later by React) gets the same flat grey picture, so layout / object-fit / radius
// are compared while the (unavailable) photos are not.
const GREY = `(() => { const G = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='#d4d4da'/></svg>");
  const fix = (i) => { if (i.getAttribute('src') !== G) { i.removeAttribute('srcset'); i.removeAttribute('sizes'); i.setAttribute('src', G) } };
  const sweep = () => document.querySelectorAll('img').forEach(fix);
  document.addEventListener('DOMContentLoaded', () => { sweep(); new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] }) });
  setInterval(sweep, 100) })()`
const FREEZE = `(() => { const FIXED = new Date('2026-10-08T12:00:00+08:00').getTime(); const R = Date;
  class D extends R { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a) } static now() { return FIXED } }
  window.Date = D })()`

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME })

async function settle(page, ms = 700) {
  await page.evaluate(() => document.fonts && document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

async function shotRef(entry) {
  const ctx = await browser.newContext({ viewport: { width: entry.w, height: entry.h } })
  const page = await ctx.newPage()
  await page.addInitScript(GREY)
  await page.goto(`file://${DESIGN}/${entry.id}.dc.html`)
  await page.evaluate(EXPAND)
  await page.addStyleTag({ content: NEUTRAL_CSS })
  // "[1,284]" / "[Nama]" are the design's placeholders for live data: the app shows the value, so compare without the brackets
  await page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/\[[^\]]*\]/.test(n.textContent) && !n.parentElement.closest('script,style')) n.textContent = n.textContent.replace(/\[([^\]]*)\]/g, '$1') } })
  await settle(page, 400)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: entry.w, height: entry.cmpH ?? entry.h }, fullPage: true })
  const text = await page.evaluate(() => document.body.innerText)
  const geo = await page.evaluate(COLLECT)
  await ctx.close()
  return { buf, text, geo }
}


// The artboards use a tiny template language (<sc-for list="{{x}}" as="i">, <sc-if value="{{v}}">, {{a.b}}); expand it with the artboard's own renderVals().
const EXPAND = () => {
  const src = document.querySelector('script[type="text/x-dc"]')
  if (!src || !document.querySelector('sc-for,sc-if')) return
  class DCLogic { constructor() { this.props = {} } }
  const Cmp = new Function('DCLogic', src.textContent + '\nreturn Component')(DCLogic)
  const vals = new Cmp().renderVals()
  const get = (path, scope) => path.trim().split('.').reduce((o, k) => (o == null ? o : o[k]), scope)
  const sub = (str, scope) => str.replace(/\{\{([^}]+)\}\}/g, (_, p) => { const v = get(p, scope); return v == null ? '' : String(v) })
  const walk = (node, scope) => {
    if (node.nodeType === 3) { node.textContent = sub(node.textContent, scope); return }
    if (node.nodeType !== 1) return
    if (node.tagName === 'SC-FOR') {
      const list = get(node.getAttribute('list').replace(/[{}]/g, ''), scope) || []
      const as = node.getAttribute('as')
      const frag = document.createDocumentFragment()
      list.forEach((item) => { const sc = { ...scope, [as]: item }; Array.from(node.childNodes).forEach((c) => { const cl = c.cloneNode(true); walk(cl, sc); frag.appendChild(cl) }) })
      node.replaceWith(frag); return
    }
    if (node.tagName === 'SC-IF') {
      const v = get(node.getAttribute('value').replace(/[{}]/g, ''), scope)
      if (!v) { node.remove(); return }
      const kids = Array.from(node.childNodes); kids.forEach((c) => walk(c, scope)); node.replaceWith(...kids); return
    }
    Array.from(node.attributes).forEach((a) => { if (a.value.includes('{{')) node.setAttribute(a.name, sub(a.value, scope)) })
    Array.from(node.childNodes).forEach((c) => walk(c, scope))
  }
  walk(document.body, vals)
}

async function shotApp(entry) {
  const ctx = await browser.newContext({ viewport: { width: entry.w, height: entry.h }, locale: 'id-ID', timezoneId: 'Asia/Taipei' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(FREEZE)
  await page.addInitScript(GREY)
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('ralulu_lang', 'id')
      Object.entries(s.local || {}).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
      Object.entries(s.session || {}).forEach(([k, v]) => sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
    } catch (e) { /* ignore */ }
  }, { local: entry.local, session: entry.session })
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const res = await apiFor(entry, url.pathname.replace(/^\/api/, ''), url.searchParams, route.request().method(), route.request().postDataJSON?.())
    if (res && res.delayForever) return new Promise(() => {}) // "loading" state: never answer
    if (res && res.__http) return route.fulfill({ status: res.__http, contentType: 'application/json', body: JSON.stringify(res.body ?? { error: 'fixture' }) })
    if (res && res.css) return route.fulfill({ status: 200, contentType: 'text/css', body: res.css })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res ?? {}) })
  })
  await page.goto(STORE + entry.route)
  await page.addStyleTag({ content: NEUTRAL_CSS })
  if (entry.actions) await entry.actions(page)
  await settle(page, entry.wait ?? 900)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: entry.w, height: entry.appH ?? entry.cmpH ?? entry.h }, fullPage: Boolean(entry.appH) })
  const text = await page.evaluate(() => document.body.innerText)
  const geo = await page.evaluate(COLLECT)
  await ctx.close()
  return { buf, text, errors, geo }
}

// Every visible text node with its box and typography - lets --geo say exactly which element is off and by how much.
const COLLECT = () => {
  const out = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = w.nextNode())) {
    const t = n.textContent.replace(/\s+/g, ' ').trim()
    const el = n.parentElement
    if (!t || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = document.createRange(); r.selectNodeContents(n)
    const b = r.getBoundingClientRect()
    if (b.width === 0 && b.height === 0) continue
    out.push({ t: t.replace(/[\[\]]/g, ''), x: Math.round(b.x * 10) / 10, y: Math.round((b.y + window.scrollY) * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10,
      fs: cs.fontSize, fw: cs.fontWeight, c: cs.color, ls: cs.letterSpacing, ff: cs.fontFamily.split(',')[0].replace(/['"]/g, '') })
  }
  return out
}
function geoDiff(ref, app) {
  const byText = (arr) => arr.reduce((m, o) => { (m.get(o.t) || m.set(o.t, []).get(o.t)).push(o); return m }, new Map())
  const A = byText(ref); const B = byText(app); const lines = []
  for (const [t, list] of A) {
    const other = B.get(t) || []
    list.forEach((o, i) => {
      const q = other[i]; if (!q) return
      const d = []
      if (Math.abs(o.x - q.x) > 1) d.push(`x ${o.x}->${q.x}`)
      if (Math.abs(o.y - q.y) > 1) d.push(`y ${o.y}->${q.y}`)
      if (Math.abs(o.w - q.w) > 2) d.push(`w ${o.w}->${q.w}`)
      if (o.fs !== q.fs) d.push(`size ${o.fs}->${q.fs}`)
      if (o.fw !== q.fw) d.push(`weight ${o.fw}->${q.fw}`)
      if (o.c !== q.c) d.push(`color ${o.c}->${q.c}`)
      if (o.ls !== q.ls) d.push(`spacing ${o.ls}->${q.ls}`)
      if (o.ff !== q.ff) d.push(`font ${o.ff}->${q.ff}`)
      if (d.length) lines.push(`"${t.slice(0, 40)}" @${Math.round(o.y)}: ${d.join(', ')}`)
    })
  }
  return lines.sort((a, b) => Number(a.match(/@(\d+)/)[1]) - Number(b.match(/@(\d+)/)[1]))
}
const norm = (t) => t.replace(/[\[\]]/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
function textDiff(refText, appText) {
  const a = norm(refText); const b = norm(appText)
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())
  const ca = count(a); const cb = count(b)
  const missing = []; const extra = []
  for (const [k, n] of ca) { const d = n - (cb.get(k) || 0); for (let i = 0; i < d; i++) missing.push(k) }
  for (const [k, n] of cb) { const d = n - (ca.get(k) || 0); for (let i = 0; i < d; i++) extra.push(k) }
  return { missing, extra }
}

// entry.regions = [[refY, appY, height], ...]: compare only these slices (stacked), for screens whose artboard shows different parts than the page lays out.
function stack(buf, ys, w) {
  const src = PNG.sync.read(buf)
  const total = ys.reduce((n, [, h]) => n + h, 0)
  const out = new PNG({ width: w, height: total }); out.data.fill(255)
  let off = 0
  for (const [y, h] of ys) { PNG.bitblt(src, out, 0, y, w, Math.min(h, Math.max(0, src.height - y)), 0, off); off += h }
  return PNG.sync.write(out)
}
let bands = []
function compare(refBuf, appBuf, w, h, id) {
  const a = PNG.sync.read(refBuf); const b = PNG.sync.read(appBuf)
  const W = Math.max(a.width, b.width); const H = Math.max(a.height, b.height)
  const pad = (img) => { const o = new PNG({ width: W, height: H }); o.data.fill(255); PNG.bitblt(img, o, 0, 0, img.width, img.height, 0, 0); return o }
  const A = pad(a); const B = pad(b); const diff = new PNG({ width: W, height: H })
  const n = pixelmatch(A.data, B.data, diff.data, W, H, { threshold: 0.1, includeAA: false })
  // where the differing pixels are (100px bands) - printed with --geo
  bands = []
  for (let y0 = 0; y0 < H; y0 += 100) { let c = 0; for (let y = y0; y < Math.min(H, y0 + 100); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (diff.data[i] === 255 && diff.data[i + 1] === 0) c++ } if (c > 30) bands.push(`${y0}:${c}`) }
  const out = new PNG({ width: W * 3 + 20, height: H }); out.data.fill(255)
  PNG.bitblt(A, out, 0, 0, W, H, 0, 0); PNG.bitblt(B, out, 0, 0, W, H, W + 10, 0); PNG.bitblt(diff, out, 0, 0, W, H, W * 2 + 20, 0)
  fs.writeFileSync(path.join(OUT, `${id}.png`), PNG.sync.write(out))
  return (n / (W * H)) * 100
}

const rows = []
for (const entry of manifest) {
  if (only.length && !only.includes(entry.id)) continue
  const t0 = Date.now()
  try {
    const ref = await shotRef(entry)
    const app = await shotApp(entry)
    const pct = entry.regions ? compare(stack(ref.buf, entry.regions.map(([r, , h]) => [r, h]), entry.w), stack(app.buf, entry.regions.map(([, a, h]) => [a, h]), entry.w), entry.w, entry.h, entry.id) : compare(ref.buf, app.buf, entry.w, entry.h, entry.id)
    const td = textDiff(ref.text, app.text)
    // intentional, documented deviations of a screen (manifest `deviate`: texts allowed to differ, `max`: looser pixel budget)
    if (entry.deviate) { const d = new Set(entry.deviate); td.missing = td.missing.filter((x) => !d.has(x)); td.extra = td.extra.filter((x) => !d.has(x)) }
    if (entry.regions) { td.missing = []; td.extra = [] } // sliced screens: only pixels are compared
    const ok = pct <= (entry.max ?? THRESHOLD) && td.missing.length === 0 && td.extra.length === 0 && app.errors.length === 0
    rows.push({ id: entry.id, pct, missing: td.missing, extra: td.extra, errors: app.errors, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${entry.id.padEnd(20)} ${pct.toFixed(2).padStart(6)}%  text -${td.missing.length}/+${td.extra.length}  ${app.errors.length ? 'ERR ' + app.errors[0] : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    if (geoFlag && bands.length) console.log('    diff bands (y:pixels): ' + bands.join('  '))
    if (geoFlag) geoDiff(ref.geo, app.geo).slice(0, 60).forEach((l) => console.log('    geo: ' + l))
    if (verbose) {
      td.missing.slice(0, 12).forEach((l) => console.log(`    missing: ${l}`))
      td.extra.slice(0, 12).forEach((l) => console.log(`    extra:   ${l}`))
    }
  } catch (e) {
    rows.push({ id: entry.id, pct: 100, missing: [], extra: [], errors: [e.message], ok: false })
    console.log(`FAIL ${entry.id.padEnd(20)} ERROR ${e.message.split('\n')[0]}`)
  }
}
await browser.close()

const passed = rows.filter((r) => r.ok).length
const md = [`# Parity report`, ``, `${passed} / ${rows.length} artboards within ${THRESHOLD}% pixel diff and identical text.`, ``, `| Artboard | Pixel diff | Missing text | Extra text | Errors |`, `|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.ok ? '✅' : '❌'} ${r.id} | ${r.pct.toFixed(2)}% | ${r.missing.length} | ${r.extra.length} | ${r.errors.length} |`), ``,
  ...rows.filter((r) => !r.ok).flatMap((r) => [`## ${r.id}`, ...r.missing.slice(0, 20).map((l) => `- missing: ${l}`), ...r.extra.slice(0, 20).map((l) => `- extra: ${l}`), ...r.errors.map((l) => `- error: ${l}`), ``])].join('\n')
fs.writeFileSync(path.join(OUT, 'report.md'), md)
console.log(`\n${passed}/${rows.length} pass  ->  ${path.relative(process.cwd(), path.join(OUT, 'report.md'))}`)
process.exit(passed === rows.length ? 0 : 1)
