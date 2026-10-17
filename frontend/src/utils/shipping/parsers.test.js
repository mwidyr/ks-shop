import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as XLSX from 'xlsx'
import { parse711Validation, parse711Export, parseFamilyMart, detectKind } from './parsers'

const dir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
function load(name) {
  const wb = XLSX.read(readFileSync(join(dir, name)), { type: 'buffer' })
  return { XLSX, wb }
}

describe('7-ELEVEN File A (import validation result)', () => {
  const parsed = load('711_file_a_validation.xlsm')
  it('is recognised', () => expect(detectKind(parsed)).toBe('711_validation'))
  it('reads 商品備註 and the verbatim Chinese error', () => {
    const recs = parse711Validation(parsed)
    expect(recs.length).toBeGreaterThan(0)
    expect(recs[0].order_no).toBe('ORD-1792154828-8241')
    expect(recs[0].result_text).toContain('無此店號')
  })
})

describe('7-ELEVEN File A variant with the platform 訂單編號 column', () => {
  const parsed = load('711_file_a_with_cm.xlsx')
  it('is recognised as validation result and turned into a success line', () => {
    expect(detectKind(parsed)).toBe('711_validation')
    const recs = parse711Validation(parsed)
    expect(recs[0]).toMatchObject({ order_no: 'TST-711-100', result_text: '檢核通過，訂單編號: CM2610168640731' })
  })
})

describe('7-ELEVEN File B (official order export)', () => {
  const parsed = load('711_file_b_order_export.xlsx')
  it('is recognised and only the 訂單匯入 sheet is read', () => {
    expect(detectKind(parsed)).toBe('711_export')
    const recs = parse711Export(parsed)
    expect(recs.length).toBe(15)
    expect(recs.every((r) => /^CM\d+$/.test(r.platform_order_no))).toBe(true)
    expect(recs.find((r) => r.order_no === 'TST-711-093').platform_order_no).toBe('CM2610168640737')
  })
  it('keeps an empty 配送單編號 empty (warning, not an error)', () => {
    expect(parse711Export(parsed).every((r) => r.shipping_no === '')).toBe(true)
  })
})

describe('FamilyMart result export', () => {
  const parsed = load('familymart_result.xlsx')
  it('is recognised and maps 賣場名稱 / 訂單編號 / 寄件編號', () => {
    expect(detectKind(parsed)).toBe('fm_result')
    const recs = parseFamilyMart(parsed)
    expect(recs.length).toBe(51)
    expect(recs[0]).toMatchObject({ order_no: 'TST-FM-076', platform_order_no: 'L26A160U9P', shipping_no: '16352289609' })
  })
})
