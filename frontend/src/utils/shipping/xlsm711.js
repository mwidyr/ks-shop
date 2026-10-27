// Fills 7-ELEVEN's own import template (賣貨便 訂單匯入檢核, the macro-enabled .xlsm) with order rows.
// The template is edited at XML level inside its zip, so everything 7-ELEVEN ships stays byte for byte:
// the macros (vbaProject.bin), the 填寫說明 sheet with its 版本號 (the web import rejects a file whose
// version is older than the current one), the frozen header, the 溫層 drop-down. Only rows are appended to
// sheet 訂單匯入, from row 7 on.
//
// Every value is written as text in the template's own text cell style (its notes ask for text in every
// column, and phone / store codes keep their leading zeros).

const FIRST_DATA_ROW = 7
const TEXT_STYLE = 18 // cellXfs entry with number format "@" (the style of the template's columns A..J)
const COLUMNS = 'ABCDEFGHIJ'

const xmlEscape = (s) => String(s ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function rowXml(rowNum, values) {
  const cells = values.map((v, i) => {
    const ref = `${COLUMNS[i]}${rowNum}`
    const text = String(v ?? '')
    if (text === '') return `<c r="${ref}" s="${TEXT_STYLE}"/>`
    return `<c r="${ref}" s="${TEXT_STYLE}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`
  })
  return `<row r="${rowNum}">${cells.join('')}</row>`
}

// values per order, in the template's column order A..J:
// 取件人姓名, 取件人手機, 取件門市, 溫層, 商品, 訂單金額, 運費金額, 買家下訂日期, 商品備註, 其他資訊
export function sevenElevenValues(r, phone) {
  return [
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
}

// templateBuffer: the .xlsm as ArrayBuffer/Uint8Array. Returns the filled workbook as a Uint8Array.
export async function fill711Template(templateBuffer, valueRows) {
  const mod = await import('jszip')
  const JSZip = mod.default || mod
  const zip = await JSZip.loadAsync(templateBuffer)
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const file = zip.file(sheetPath)
  if (!file) throw new Error('7-ELEVEN template: sheet1.xml not found')
  let xml = await file.async('string')
  if (!xml.includes('</sheetData>')) throw new Error('7-ELEVEN template: unexpected sheet layout')
  const rows = valueRows.map((v, i) => rowXml(FIRST_DATA_ROW + i, v)).join('')
  xml = xml.replace('</sheetData>', `${rows}</sheetData>`)
  const last = FIRST_DATA_ROW + valueRows.length - 1
  if (valueRows.length > 0) xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:K${last}"/>`)
  zip.file(sheetPath, xml, { createFolders: false })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
