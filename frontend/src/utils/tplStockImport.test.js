import { describe, expect, it } from 'vitest'
import { parseTplStockRows } from './tplStockImport'

const head = ['分類', '物料編號', '客戶', '物料名稱', '規格', '型號', '廠牌', '倉庫', '倉庫數量', '可用庫存(虛擬庫存)', '實際數量']

describe('parseTplStockRows', () => {
  it('reads SKU (B) and available stock (J), not 倉庫數量 (I) or 實際數量 (K)', () => {
    const rows = [['拉魯魯'], ['title'], head, ['無組成', 'A003BLACK', '', '', '', '', '', '小倉幫', 42, 41, 40], ['無組成', 'V002REDFREESIZE', '', '', '', '', '', '', 7, 0, 7]]
    expect(parseTplStockRows(rows)).toEqual([{ sku: 'A003BLACK', qty: 41 }, { sku: 'V002REDFREESIZE', qty: 0 }])
  })
  it('reads a negative (oversold) virtual stock as 0', () => {
    expect(parseTplStockRows([head, ['', 'C025BLACKFREESIZE', '', '', '', '', '', '', 0, -20, 0]])).toEqual([{ sku: 'C025BLACKFREESIZE', qty: 0 }])
  })
  it('finds the column when the header uses full-width brackets', () => {
    const fw = ['物料編號', '可用庫存（虛擬庫存）']
    expect(parseTplStockRows([fw, ['X1', 5]])).toEqual([{ sku: 'X1', qty: 5 }])
  })
  it('refuses a file that only has the old 實際數量 column', () => {
    expect(() => parseTplStockRows([['物料編號', '實際數量'], ['X1', 5]])).toThrow('header_not_found')
  })
  it('refuses a file without the expected headers', () => {
    expect(() => parseTplStockRows([['a', 'b']])).toThrow('header_not_found')
  })
  it('refuses a non-numeric or fractional quantity', () => {
    expect(() => parseTplStockRows([head, ['', 'X', '', '', '', '', '', '', '', 'abc', '']])).toThrow('bad_qty:X')
    expect(() => parseTplStockRows([head, ['', 'X', '', '', '', '', '', '', '', 1.5, '']])).toThrow('bad_qty:X')
  })
})
