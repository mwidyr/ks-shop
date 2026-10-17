// Parses the Excel files the shipping platforms and the 3PL give us into the normalised records the
// backend imports (POST /shipping-workbench/imports). Everything is matched by HEADER NAME, never
// by column letter, because the platforms add/reorder columns; only the sheet that holds the real
// orders is read (7-ELEVEN's export also has a "非訂單匯入" sheet that must be ignored).
//
// Record shape: { row, order_no, platform_order_no, shipping_no, result_text, status }
//   order_no            our ERP order number (7-11 商品備註 / FamilyMart 賣場名稱)
//   platform_order_no   the platform's own order number (7-11 CM…, FamilyMart 訂單編號)
//   shipping_no         the shipping number (7-11 配送單編號 G…, FamilyMart 寄件編號)
//   result_text         7-ELEVEN 網頁匯入檢核結果說明, kept verbatim (Chinese)
// The 3PL and delivery-status formats are NOT known yet: their parsers refuse to guess.

export class AdapterNotConfigured extends Error {
  constructor(kind) {
    super(`adapter_not_configured:${kind}`)
    this.kind = kind
  }
}

const clean = (v) => String(v ?? '').replace(/[\s*＊]/g, '')
const text = (v) => String(v ?? '').trim()

async function loadXlsx() {
  const mod = await import('xlsx')
  return mod.default && mod.default.read ? mod.default : mod
}

export async function readWorkbook(file) {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  return { XLSX, wb }
}

export async function sha256Hex(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Some platform exports declare a wrong <dimension> (e.g. 3 rows for a sheet that holds 17), and
// SheetJS trusts it and silently drops the rest - so the real range is rebuilt from the cells.
function fixRange(XLSX, ws) {
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue
    const { r, c } = XLSX.utils.decode_cell(key)
    if (r < minR) minR = r
    if (c < minC) minC = c
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  if (maxR >= 0) ws['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } })
}

// Rows of a sheet as arrays of display strings.
function sheetRows(XLSX, wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return null
  fixRange(XLSX, ws)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
}

// First row containing every wanted header; returns { headerIndex, col: {name -> column index} }.
function findHeader(rows, wanted) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(clean)
    if (wanted.every((w) => cells.includes(clean(w)))) {
      const col = {}
      cells.forEach((c, idx) => { if (c && !(c in col)) col[c] = idx })
      return { headerIndex: i, col }
    }
  }
  return null
}

// Looks at every sheet of the workbook and returns the first one that has all wanted headers.
function locate(XLSX, wb, wanted, sheetNames) {
  for (const name of sheetNames || wb.SheetNames) {
    const rows = sheetRows(XLSX, wb, name)
    if (!rows) continue
    const h = findHeader(rows, wanted)
    if (h) return { name, rows, ...h }
  }
  return null
}

const ORDER_SHEET = '訂單匯入'

// 7-ELEVEN File A - 訂單匯入結果 (the import-validation result). Either the .xlsm with
// 網頁匯入檢核結果說明, or the .xlsx variant that carries the platform 訂單編號 column instead.
export function parse711Validation({ XLSX, wb }) {
  const withText = locate(XLSX, wb, ['商品備註', '網頁匯入檢核結果說明'], [ORDER_SHEET])
  const withCm = !withText && locate(XLSX, wb, ['商品備註', '訂單編號'], wb.SheetNames.filter((n) => n !== '非訂單匯入'))
  const found = withText || withCm
  if (!found) return null
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('商品備註')]])
    if (!orderNo) continue
    let resultText
    if (withText) {
      resultText = text(r[found.col[clean('網頁匯入檢核結果說明')]])
    } else {
      const cm = text(r[found.col[clean('訂單編號')]])
      resultText = cm ? `檢核通過，訂單編號: ${cm}` : ''
    }
    records.push({ row: i + 1, order_no: orderNo, result_text: resultText })
  }
  return records
}

// 7-ELEVEN File B - the official order export; only the 訂單匯入 worksheet is read.
export function parse711Export({ XLSX, wb }) {
  const found = locate(XLSX, wb, ['商品備註', '訂單編號', '配送單編號'], [ORDER_SHEET])
  if (!found) return null
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('商品備註')]])
    if (!orderNo) continue
    records.push({
      row: i + 1,
      order_no: orderNo,
      platform_order_no: text(r[found.col[clean('訂單編號')]]),
      shipping_no: text(r[found.col[clean('配送單編號')]]),
    })
  }
  return records
}

// FamilyMart - the order export taken after the shipping numbers were obtained on the platform.
export function parseFamilyMart({ XLSX, wb }) {
  const found = locate(XLSX, wb, ['賣場名稱', '訂單編號', '寄件編號'])
  if (!found) return null
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('賣場名稱')]])
    if (!orderNo) continue
    records.push({
      row: i + 1,
      order_no: orderNo,
      platform_order_no: text(r[found.col[clean('訂單編號')]]),
      shipping_no: text(r[found.col[clean('寄件編號')]]),
    })
  }
  return records
}

// Detects which of the known files a workbook is. Returns the import kind or null.
export function detectKind(parsed) {
  if (locate(parsed.XLSX, parsed.wb, ['商品備註', '網頁匯入檢核結果說明'], [ORDER_SHEET])) return '711_validation'
  if (locate(parsed.XLSX, parsed.wb, ['商品備註', '訂單編號', '配送單編號'], [ORDER_SHEET])) return '711_export'
  if (locate(parsed.XLSX, parsed.wb, ['賣場名稱', '訂單編號', '寄件編號'])) return 'fm_result'
  if (locate(parsed.XLSX, parsed.wb, ['商品備註', '訂單編號'], parsed.wb.SheetNames.filter((n) => n !== '非訂單匯入'))) return '711_validation'
  return null
}

export const PROVIDER_OF_KIND = {
  '711_validation': 'cvs_711',
  '711_export': 'cvs_711',
  fm_result: 'cvs_familymart',
  hct_result: 'courier',
}

// Kinds whose file format we do not know yet - the UI shows them as "waiting for the file format".
export const PENDING_KINDS = ['hct_result', '3pl_shipment', 'delivery']

export function parseKind(parsed, kind) {
  switch (kind) {
    case '711_validation': return parse711Validation(parsed)
    case '711_export': return parse711Export(parsed)
    case 'fm_result': return parseFamilyMart(parsed)
    default: throw new AdapterNotConfigured(kind)
  }
}

// Reads a file for the expected kind. Returns { kind, records, fileHash, fileName } or throws:
//   AdapterNotConfigured - the format of this kind is not defined yet;
//   Error('unrecognised_file') / Error('wrong_file:<detected>') - the file is not the expected one.
export async function readImportFile(file, expectedKind) {
  if (PENDING_KINDS.includes(expectedKind)) throw new AdapterNotConfigured(expectedKind)
  const parsed = await readWorkbook(file)
  const detected = detectKind(parsed)
  if (!detected) throw new Error('unrecognised_file')
  if (expectedKind && expectedKind !== 'auto' && detected !== expectedKind) throw new Error(`wrong_file:${detected}`)
  const records = parseKind(parsed, detected)
  if (!records || records.length === 0) throw new Error('empty_file')
  return { kind: detected, records, fileHash: await sha256Hex(file), fileName: file.name }
}
