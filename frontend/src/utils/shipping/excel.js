// Builds the Excel files that go to the shipping platforms and the warehouse. The 7-ELEVEN and
// FamilyMart files are the client's own real import templates (public/cvs-templates), filled in
// place so every instruction row, extra sheet, style and the frozen header stay the
// genuine original (7-ELEVEN's, being macro-enabled, is filled at zip level, see xlsm711.js). The HCT file is built from the template's literal headers. The internal ERP
// order number always goes in the remark/product column (7-11 商品備註, FamilyMart 商品, HCT 訂單號),
// because that is what the imported results are matched on.

// 7-ELEVEN is different: its template is a macro-enabled .xlsm that must stay intact (see xlsm711.js), so
// it is filled at zip level instead of through exceljs, and the file it produces is an .xlsm too.
const CVS_711_TEMPLATE_URL = '/cvs-templates/711.xlsm'
const XLSM_MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12'

const CVS_TEMPLATES = {
  cvs_familymart: {
    url: '/cvs-templates/FamilyMart.xlsx',
    sheetName: '大量匯單',
    firstDataRow: 20, // row 19 is the real header
    exampleRowsToClear: [20, 21], // the template ships two sample rows
  },
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Both templates need the phone as bare digits (no dashes / +886).
export function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

// Literal headers required by HCT's own import template (matched by exact text/position).
export const HCT_HEADERS = [
  '序號\n(無用途)',
  '訂單號\n長度限制: 20碼\n請勿使用中文',
  '收件人姓名(必填)\n長度限制: 20碼',
  '收件人地址(必填)\n中文限制: 50字',
  '收件人電話(必填)\n長度限制: 15碼',
  '託運備註\n中文限制: 50字',
  '(商品別編號)\n勿填',
  '商品數量(必填)\n(限數字)\n<100',
  '才積重量\n限數字',
  '代收貨款\n限數字',
  '指定配送日期YYYYMMDD\n範例: 20140220    ->2月20號',
  '指定配送時間\n範例:   1   (上午 -> 09~13)\n            2   (下午 -> 13~17)\n            3   (晚上 -> 17~20)',
]

const truncate = (s, n) => (s || '').slice(0, n)

async function build711(rows) {
  const res = await fetch(CVS_711_TEMPLATE_URL)
  if (!res.ok) throw new Error(`failed to load ${CVS_711_TEMPLATE_URL}`)
  const { fill711Template, sevenElevenValues } = await import('./xlsm711')
  const bytes = await fill711Template(await res.arrayBuffer(), rows.map((r) => sevenElevenValues(r, normalizePhone(r.customer_phone))))
  return new Blob([bytes], { type: XLSM_MIME })
}

async function buildCvs(provider, rows) {
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const tpl = CVS_TEMPLATES[provider]
  const res = await fetch(tpl.url)
  if (!res.ok) throw new Error(`failed to load ${tpl.url}`)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await res.arrayBuffer())
  const worksheet = workbook.getWorksheet(tpl.sheetName)
  if (!worksheet) throw new Error(`template sheet ${tpl.sheetName} not found`)
  for (const rowNum of tpl.exampleRowsToClear) {
    worksheet.getRow(rowNum).eachCell({ includeEmpty: true }, (cell) => { cell.value = null })
  }
  rows.forEach((r, i) => {
    const phone = normalizePhone(r.customer_phone)
    const row = worksheet.getRow(tpl.firstDataRow + i)
    const values = [
      r.customer_name,
      phone,
      r.pickup_store_code,
      String(r.item_value), // 商品金額 - products only
      String(r.shipping_fee), // 運費金額
      r.order_date,
      r.order_no, // 商品 - our ERP order number, the match key for the results
    ]
    values.forEach((v, colIdx) => { row.getCell(colIdx + 1).value = v })
    // FamilyMart wants every column as text; phone + store code are kept as text (leading zeros).
    for (const col of [2, 3, 4, 5]) row.getCell(col).numFmt = '@'
    row.commit()
  })
  const buf = await workbook.xlsx.writeBuffer()
  return new Blob([buf], { type: XLSX_MIME })
}

async function buildHct(rows) {
  const XLSX = await import('xlsx')
  const dataRows = rows.map((r) => [
    '',
    r.order_no, // 訂單號 - our ERP order number (<= 20 chars, no Chinese)
    truncate(r.customer_name, 20),
    r.shipping_address,
    truncate(r.customer_phone, 15),
    '', '', 1, '',
    r.total_to_pay, // 代收貨款 - products + actual shipping fee
    '', '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([HCT_HEADERS, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: XLSX_MIME })
}

// The file staff upload to the shipping platform to create the orders (initial and retry alike).
export function buildPlatformExcel(provider, rows) {
  if (provider === 'courier') return buildHct(rows)
  return provider === 'cvs_711' ? build711(rows) : buildCvs(provider, rows)
}

// 7-ELEVEN's file stays a macro-enabled workbook; the others are plain .xlsx.
export const platformFileExt = (provider) => (provider === 'cvs_711' ? 'xlsm' : 'xlsx')

// The 3PL's own order-import template (訂單匯出, 34 columns A-AH, the literal headers of 3PL_Export_Template.xlsx).
// One row per product line; a merged shipment is ONE order number carrying all its lines.
export const THREEPL_HEADERS = [
  '訂單編號*', '訂單日期', '單據類別', '收件人姓名或常用地址代號*', '地址*', '電話', '物流類型', '超商門市店號(超取必填)',
  '訂單金額(超取必填)', '是否代收貨款(Y/N)\n(超取付款可不填)', '來回件', '品號*', '品名', '數量*', '單品單價', '單品備註', '訂單備註',
  '到貨日期', '配達時段', '額外單號', '預約出貨日', '指定托運單號', '電子郵件', '郵遞區號', '城市', '國家', '識別碼', '幣別',
  '出貨人名稱', '出貨人電話', '發票號碼', '縣市', '鄉鎮市區', '街道地址',
]
const THREEPL_LOGISTICS = { courier: 'Hct', cvs_711: '7-ELEVEN', cvs_familymart: 'FamilyMart' }

export function buildThreePLRows(rows) {
  const out = []
  for (const r of rows) {
    const lines = r.lines?.length ? r.lines : [{ sku: '', name: r.packing_products || '', qty: r.total_qty, price: '' }]
    for (const l of lines) {
      const row = new Array(THREEPL_HEADERS.length).fill('')
      row[0] = r.order_no
      row[1] = r.order_date || ''
      row[3] = r.customer_name
      row[4] = r.is_home_delivery ? r.shipping_address : r.pickup_store_name
      row[5] = normalizePhone(r.customer_phone)
      row[6] = THREEPL_LOGISTICS[r.chain_type] || r.pickup_chain_name || ''
      row[7] = r.is_home_delivery ? '' : r.pickup_store_code
      row[8] = r.total_to_pay
      row[9] = 'N'
      row[11] = l.sku
      row[12] = l.name
      row[13] = l.qty
      row[14] = l.price
      row[16] = r.internal_notes_combined || ''
      row[19] = r.group_order_nos?.length ? r.group_order_nos.join(' / ') : ''
      row[21] = r.tracking_number || ''
      out.push(row)
    }
  }
  return out
}

export async function buildThreePLExcel(rows) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([THREEPL_HEADERS, ...buildThreePLRows(rows)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '訂單匯出')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: XLSX_MIME })
}

// Packing label workbook for the warehouse (the packing staff's own app format).
export async function buildPackingLabel(rows) {
  const XLSX = await import('xlsx')
  const packingRows = rows.map((r) => ({
    '訂單編號': r.group_order_nos?.length ? [r.order_no, ...r.group_order_nos].join(' + ') : r.order_no,
    '平台訂單編號': r.platform_order_no || '',
    '配送單編號': r.tracking_number || '',
    '客戶': r.customer_name,
    '電話': r.customer_phone,
    '取貨門市': r.pickup_store_name,
    '店號': r.pickup_store_code,
    '訂購商品': r.packing_products,
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(packingRows), 'Packing Label')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: XLSX_MIME })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportFilename(kind, batchNo, ext = 'xlsx') {
  return `${batchNo}-${kind}.${ext}`
}
