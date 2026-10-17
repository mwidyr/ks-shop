// Builds the Excel files that go to the shipping platforms and the warehouse. The 7-ELEVEN and
// FamilyMart files are the client's own real import templates (public/cvs-templates), filled in
// place with exceljs so every instruction row, extra sheet, style and the frozen header stay the
// genuine original. The HCT file is built from the template's literal headers. The internal ERP
// order number always goes in the remark/product column (7-11 商品備註, FamilyMart 商品, HCT 訂單號),
// because that is what the imported results are matched on.

const CVS_TEMPLATES = {
  cvs_711: {
    url: '/cvs-templates/711.xlsx',
    sheetName: '訂單匯入',
    firstDataRow: 7, // row 6 is the real header
    exampleRowsToClear: [],
  },
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

async function buildCvs(provider, rows) {
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const is711 = provider === 'cvs_711'
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
    const values = is711
      ? [
          r.customer_name,
          phone,
          r.pickup_store_code,
          '常溫', // temperature type - always room temperature
          r.categories_zh, // 商品 - unique Chinese category names (product names can trip the keyword filter)
          // 訂單金額 = products + shipping fee, 運費金額 = 0 (7-ELEVEN rejects a separate fee above its promo fee)
          Number(r.item_value || 0) + Number(r.shipping_fee || 0),
          0,
          r.order_date, // Taiwan date
          r.order_no, // 商品備註 - our ERP order number, the match key for the results
          '',
        ]
      : [
          r.customer_name,
          phone,
          r.pickup_store_code,
          String(r.item_value), // 商品金額 - products only
          String(r.shipping_fee), // 運費金額
          r.order_date,
          r.order_no, // 商品 - our ERP order number, the match key for the results
        ]
    values.forEach((v, colIdx) => { row.getCell(colIdx + 1).value = v })
    // FamilyMart wants every column as text; both need phone + store code kept as text (leading zeros).
    for (const col of is711 ? [2, 3] : [2, 3, 4, 5]) row.getCell(col).numFmt = '@'
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
  return provider === 'courier' ? buildHct(rows) : buildCvs(provider, rows)
}

// Packing label workbook for the warehouse (the packing staff's own app format). Placeholder for
// the 3PL packing Excel until the 3PL confirms its real format.
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

export function exportFilename(kind, batchNo) {
  return `${batchNo}-${kind}.xlsx`
}
