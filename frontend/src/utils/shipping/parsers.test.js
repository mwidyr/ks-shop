import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as XLSX from 'xlsx'
import { parse711Validation, parse711Export, parseFamilyMart, detectKind, detectDelivery, parseDelivery } from './parsers'

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
  it('also reads the newer export that has no 賣場名稱 column (our order number is in 商品名稱)', () => {
    const p2 = load('familymart_result_new.xlsx')
    expect(detectKind(p2)).toBe('fm_result')
    const recs = parseFamilyMart(p2)
    expect(recs).toHaveLength(6)
    expect(recs[0]).toMatchObject({ order_no: 'ORD-1793701074-2765', platform_order_no: 'L26B0402C0', shipping_no: '16353754424' })
  })
})

describe('completion (delivery) reports', () => {
  const book = (name, rows) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
    return { XLSX, wb }
  }

  it('7-ELEVEN: only 「已取件」 rows become completed, matched on 商品備註', () => {
    const parsed = book('訂單匯入', [
      ['訂購日期：2026/09/05~2026/11/05'], [],
      ['訂單編號', '狀態', '已取件日期時間', '配送單編號', '商品備註'],
      ['CM1', '已取件\n(11/05 19:11)', '(11/05 19:11)', 'H1', 'ORD-1'],
      ['CM2', '配送中', '', 'H2', 'ORD-2'],
    ])
    expect(detectDelivery(parsed)).toBe('cvs_711')
    expect(parseDelivery(parsed, 'cvs_711')).toEqual([{ row: 4, order_no: 'ORD-1', status: 'completed' }])
  })

  it('FamilyMart: only 「已付款」 rows become completed, matched on 商品名稱', () => {
    const parsed = book('Sheet1', [
      ['訂單編號', '商品名稱', '付款狀態', '寄件編號'],
      ['L1', 'ORD-1', '已付款', '1635'],
      ['L2', 'ORD-2', '未付款', '1636'],
    ])
    expect(detectDelivery(parsed)).toBe('cvs_familymart')
    expect(parseDelivery(parsed, 'cvs_familymart')).toEqual([{ row: 2, order_no: 'ORD-1', status: 'completed' }])
  })
})
