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
// Delivery (completion) files - the platforms' pickup/payment reports - only carry our order number and a
// status; see parseDelivery. (The 3PL sends no files back.)

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

// Result texts 7-ELEVEN writes per order: 檢核通過，訂單編號: CM... or a validation error like [取件門市]：(常溫)無此店號.
const RESULT_TEXT = /檢核通過|訂單編號|^\[.+\]\s*[：:]/

// Finds 7-ELEVEN File A. Returns { rows, headerIndex, col, textCol, cmCol } or null, where the result is read from
// column textCol (網頁匯入檢核結果說明) or, for the .xlsx variant, built from the platform order number in cmCol.
//   a. the header 網頁匯入檢核結果說明 (the .xlsm as it has always been);
//   b. the same file without that header text (template v1.6 dropped it): the result column is the one right of
//      excel驗證結果說明, accepted only when rows below really hold result texts, so nothing is guessed;
//   c. the .xlsx variant that carries the platform 訂單編號 column.
function locate711Validation(XLSX, wb) {
  const a = locate(XLSX, wb, ['商品備註', '網頁匯入檢核結果說明'], [ORDER_SHEET])
  if (a) return { ...a, textCol: a.col[clean('網頁匯入檢核結果說明')] }
  const b = locate(XLSX, wb, ['商品備註', 'excel驗證結果說明'], [ORDER_SHEET])
  if (b) {
    const textCol = b.col[clean('excel驗證結果說明')] + 1
    const holdsResults = b.rows.slice(b.headerIndex + 1).some((r) => RESULT_TEXT.test(text(r[textCol])))
    if (holdsResults) return { ...b, textCol }
  }
  const c = locate(XLSX, wb, ['商品備註', '訂單編號'], wb.SheetNames.filter((n) => n !== '非訂單匯入'))
  if (c) return { ...c, cmCol: c.col[clean('訂單編號')] }
  return null
}

// 7-ELEVEN File A - 訂單匯入結果 (the import-validation result): the .xlsm with the result text per order, or the
// .xlsx variant that carries the platform 訂單編號 column instead.
export function parse711Validation({ XLSX, wb }) {
  const found = locate711Validation(XLSX, wb)
  if (!found) return null
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('商品備註')]])
    if (!orderNo) continue
    let resultText
    if (found.textCol !== undefined) {
      resultText = text(r[found.textCol])
    } else {
      const cm = text(r[found.cmCol])
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
// Our order number sits in 賣場名稱 (the older export) or, in the newer 44-column export without that column, in 商品名稱.
const FM_ORDER_COLS = ['賣場名稱', '商品名稱']

function locateFamilyMart(XLSX, wb) {
  for (const c of FM_ORDER_COLS) {
    const found = locate(XLSX, wb, [c, '訂單編號', '寄件編號'])
    if (found) return { ...found, orderCol: c }
  }
  return null
}

export function parseFamilyMart({ XLSX, wb }) {
  const found = locateFamilyMart(XLSX, wb)
  if (!found) return null
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean(found.orderCol)]])
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

// Completion reports. Only the orders the platform reports as picked up / paid become records (status
// 'completed'); every other row is left out, so those orders stay as they are. Overlap between exports
// is expected: the backend skips orders that are already Completed.
//   7-ELEVEN  sheet 訂單匯入: 狀態 contains 「已取件」 (with a timestamp), our order number in 商品備註
//   FamilyMart: 付款狀態 is 「已付款」, our order number in 商品名稱
function locate711Delivery(XLSX, wb) {
  return locate(XLSX, wb, ['商品備註', '狀態', '已取件日期時間'], [ORDER_SHEET])
}
function locateFamilyMartDelivery(XLSX, wb) {
  return locate(XLSX, wb, ['商品名稱', '付款狀態', '寄件編號'])
}

export function detectDelivery({ XLSX, wb }) {
  if (locate711Delivery(XLSX, wb)) return 'cvs_711'
  if (locateFamilyMartDelivery(XLSX, wb)) return 'cvs_familymart'
  return null
}

export function parseDelivery({ XLSX, wb }, provider) {
  const is711 = provider === 'cvs_711'
  const found = is711 ? locate711Delivery(XLSX, wb) : locateFamilyMartDelivery(XLSX, wb)
  if (!found) return null
  const orderCol = found.col[clean(is711 ? '商品備註' : '商品名稱')]
  const statusCol = found.col[clean(is711 ? '狀態' : '付款狀態')]
  const done = is711 ? '已取件' : '已付款'
  const records = []
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[orderCol])
    if (!orderNo || !text(r[statusCol]).includes(done)) continue
    records.push({ row: i + 1, order_no: orderNo, status: 'completed' })
  }
  return records
}

// ---- exception reports (7-ELEVEN expired labels / unclaimed returns, FamilyMart unclaimed returns) -----------------------
// 7-ELEVEN: the 訂單匯入 sheet, cell H1 says what the report is: 類別：取消訂單 (the platform cancelled the label) or
// 類別：未取退宅 (unclaimed return). Both need 訂單編號 (the platform's order no.) AND 商品備註 (our order no.) to match.
// FamilyMart: every row carries 訂單狀態; only 退回 rows are unclaimed returns (our order no. is in 商品名稱).
const H1_CATEGORY = { '取消訂單': '711_expired', '未取退宅': '711_unclaimed' }
// 7-ELEVEN 狀態 values that mean "the parcel was never picked up". Other statuses in the same file (picked up,
// shipped, delivered ...) are left alone: they must never return an order or blacklist a customer.
export const UNCLAIMED_711_STATUSES = ['逾期未取件']
export const FM_RETURN_STATUS = '退回'

function locate711Exception(XLSX, wb) {
  return locate(XLSX, wb, ['商品備註', '訂單編號'], [ORDER_SHEET])
}

// The report category written in cell H1 of the 訂單匯入 sheet ('' when absent).
export function category711({ XLSX, wb }) {
  const rows = sheetRows(XLSX, wb, ORDER_SHEET)
  if (!rows || !rows[0]) return ''
  const m = clean(rows[0][7]).match(/^類別[:：](.+)$/)
  return m ? m[1] : ''
}

export function detect711Exception(parsed) {
  if (!locate711Exception(parsed.XLSX, parsed.wb)) return null
  return H1_CATEGORY[category711(parsed)] || null
}

export function parse711Exception(parsed, kind) {
  const found = locate711Exception(parsed.XLSX, parsed.wb)
  if (!found) return null
  const statusCol = found.col[clean('狀態')]
  const records = []
  let ignored = 0
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('商品備註')]])
    const platformNo = text(r[found.col[clean('訂單編號')]])
    if (!orderNo && !platformNo) continue
    if (kind === '711_unclaimed' && !UNCLAIMED_711_STATUSES.some((st) => text(r[statusCol]).includes(st))) { ignored++; continue }
    records.push({ row: i + 1, order_no: orderNo, platform_order_no: platformNo })
  }
  return { records, ignored }
}

export function parseFamilyMartUnclaimed({ XLSX, wb }) {
  const found = locate(XLSX, wb, ['訂單編號', '商品名稱', '訂單狀態'])
  if (!found) return null
  const records = []
  let ignored = 0
  for (let i = found.headerIndex + 1; i < found.rows.length; i++) {
    const r = found.rows[i]
    const orderNo = text(r[found.col[clean('商品名稱')]])
    const platformNo = text(r[found.col[clean('訂單編號')]])
    if (!orderNo && !platformNo) continue
    if (clean(r[found.col[clean('訂單狀態')]]) !== FM_RETURN_STATUS) { ignored++; continue }
    records.push({ row: i + 1, order_no: orderNo, platform_order_no: platformNo })
  }
  return { records, ignored }
}

// Detects which of the known files a workbook is. Returns the import kind or null.
// (A completion report has the same columns as the platform's normal export, so it is never auto-detected:
// it is only read when the "completed orders" upload box asks for it - see readImportFile.)
export function detectKind(parsed) {
  // an exception report has the same columns as the normal 7-ELEVEN export: its H1 category tells them apart
  const exception = detect711Exception(parsed)
  if (exception) return exception
  const validation = locate711Validation(parsed.XLSX, parsed.wb)
  if (validation && validation.textCol !== undefined) return '711_validation'
  if (locate(parsed.XLSX, parsed.wb, ['商品備註', '訂單編號', '配送單編號'], [ORDER_SHEET])) return '711_export'
  if (locateFamilyMart(parsed.XLSX, parsed.wb)) return 'fm_result'
  if (locate(parsed.XLSX, parsed.wb, ['商品備註', '訂單編號'], parsed.wb.SheetNames.filter((n) => n !== '非訂單匯入'))) return '711_validation'
  return null
}

export const PROVIDER_OF_KIND = {
  '711_validation': 'cvs_711',
  '711_export': 'cvs_711',
  fm_result: 'cvs_familymart',
  hct_result: 'courier',
  '711_expired': 'cvs_711',
  '711_unclaimed': 'cvs_711',
  fm_unclaimed: 'cvs_familymart',
}

// Kinds whose file format we do not know yet - the UI shows them as "waiting for the file format".
export const PENDING_KINDS = ['hct_result']

export function parseKind(parsed, kind) {
  switch (kind) {
    case '711_validation': return parse711Validation(parsed)
    case '711_export': return parse711Export(parsed)
    case 'fm_result': return parseFamilyMart(parsed)
    default: throw new AdapterNotConfigured(kind)
  }
}

// Reads a file for the expected kind. Returns { kind, records, fileHash, fileName } (delivery files also { provider }) or throws:
//   AdapterNotConfigured - the format of this kind is not defined yet;
//   Error('unrecognised_file') / Error('wrong_file:<detected>') - the file is not the expected one.
export async function readImportFile(file, expectedKind) {
  if (PENDING_KINDS.includes(expectedKind)) throw new AdapterNotConfigured(expectedKind)
  const parsed = await readWorkbook(file)
  if (expectedKind === 'fm_unclaimed') {
    const res = parseFamilyMartUnclaimed(parsed)
    if (!res) throw new Error('unrecognised_file')
    if (res.records.length === 0) throw new Error('no_unclaimed_rows')
    return { kind: 'fm_unclaimed', records: res.records, ignored: res.ignored, fileHash: await sha256Hex(file), fileName: file.name }
  }
  if (expectedKind === '711_expired' || expectedKind === '711_unclaimed' || expectedKind === '711_exception') {
    // one upload area for both 7-ELEVEN reports: cell H1 decides which one it is, anything else is refused
    if (!locate711Exception(parsed.XLSX, parsed.wb)) throw new Error('unrecognised_file')
    const kind = detect711Exception(parsed)
    if (!kind) throw new Error('wrong_category')
    if (expectedKind !== '711_exception' && expectedKind !== kind) throw new Error('wrong_category')
    const res = parse711Exception(parsed, kind)
    if (!res.records.length) throw new Error(kind === '711_unclaimed' ? 'no_unclaimed_rows' : 'empty_file')
    return { kind, records: res.records, ignored: res.ignored, fileHash: await sha256Hex(file), fileName: file.name }
  }
  if (expectedKind === 'delivery') {
    const provider = detectDelivery(parsed)
    if (!provider) throw new Error('unrecognised_file')
    const records = parseDelivery(parsed, provider)
    if (!records || records.length === 0) throw new Error('no_completed_rows')
    return { kind: 'delivery', provider, records, fileHash: await sha256Hex(file), fileName: file.name }
  }
  const detected = detectKind(parsed)
  if (!detected) throw new Error('unrecognised_file')
  if (expectedKind && expectedKind !== 'auto' && detected !== expectedKind) throw new Error(`wrong_file:${detected}`)
  const records = parseKind(parsed, detected)
  if (!records || records.length === 0) throw new Error('empty_file')
  return { kind: detected, records, fileHash: await sha256Hex(file), fileName: file.name }
}
