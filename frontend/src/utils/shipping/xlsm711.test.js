import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { fill711Template, sevenElevenValues } from './xlsm711'

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../public/cvs-templates/711.xlsm'))
const row = (n, over = {}) => ({
  customer_name: '王小明', customer_phone: '0912-345-678', pickup_store_code: '012345', categories_zh: '上衣、褲子',
  item_value: 900, shipping_fee: 60, order_date: '2026/10/27', order_no: `ORD-${n}`, ...over,
})
const values = (rows) => rows.map((r) => sevenElevenValues(r, r.customer_phone.replace(/\D/g, '')))

describe('7-ELEVEN .xlsm template fill', () => {
  it('keeps the macros, the version sheet and the header intact', async () => {
    const out = await fill711Template(template, values([row(1)]))
    const zip = await JSZip.loadAsync(out)
    const original = await JSZip.loadAsync(template)
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(original.files).sort())
    const bin = await zip.file('xl/vbaProject.bin').async('uint8array')
    const binOriginal = await original.file('xl/vbaProject.bin').async('uint8array')
    expect(Buffer.from(bin).equals(Buffer.from(binOriginal))).toBe(true)
    for (const name of ['xl/worksheets/sheet2.xml', 'xl/workbook.xml', '[Content_Types].xml', 'xl/sharedStrings.xml']) {
      expect(await zip.file(name).async('string')).toBe(await original.file(name).async('string'))
    }
    const wb = XLSX.read(out, { type: 'buffer' })
    expect(wb.SheetNames).toEqual(['訂單匯入', '填寫說明'])
    expect(wb.Sheets['填寫說明'].B1.v).toBe('1.5') // the current template version
    expect(wb.Sheets['訂單匯入'].A6.v).toBe('＊取件人姓名')
  })

  it('writes one row per order from row 7, as text, keeping leading zeros', async () => {
    const out = await fill711Template(template, values([row(1), row(2, { customer_name: 'A&B <c>', item_value: 1200, shipping_fee: 0 })]))
    const ws = XLSX.read(out, { type: 'buffer' }).Sheets['訂單匯入']
    const cell = (a) => ws[a]?.v
    expect([cell('A7'), cell('B7'), cell('C7'), cell('D7'), cell('E7'), cell('F7'), cell('G7'), cell('H7'), cell('I7')])
      .toEqual(['王小明', '0912345678', '012345', '常溫', '上衣、褲子', '960', '0', '2026/10/27', 'ORD-1'])
    expect(cell('A8')).toBe('A&B <c>')
    expect(cell('F8')).toBe('1200')
    expect(cell('I8')).toBe('ORD-2')
    expect(ws['!ref']).toBe('A1:K8')
  })

  it('an empty batch leaves the template as it is', async () => {
    const out = await fill711Template(template, [])
    expect(XLSX.read(out, { type: 'buffer' }).Sheets['訂單匯入']['!ref']).toBe('A1:K6')
  })
})
