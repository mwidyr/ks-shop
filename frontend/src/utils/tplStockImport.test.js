import { describe, expect, it } from 'vitest'
import { parseTplStockRows } from './tplStockImport'

const head = ['分類', '物料編號', '客戶', '物料名稱', '規格', '型號', '廠牌', '倉庫', '倉庫數量', '可用庫存(虛擬庫存)', '實際數量']

describe('parseTplStockRows', () => {
  it('reads SKU (B) and actual quantity (K) after the header row', () => {
    const rows = [['拉魯魯'], ['title'], head, ['無組成', 'A003BLACK', '', '', '', '', '', '小倉幫', 42, 41, 42], ['無組成', 'V002REDFREESIZE', '', '', '', '', '', '', '', 0, 0]]
    expect(parseTplStockRows(rows)).toEqual([{ sku: 'A003BLACK', qty: 42 }, { sku: 'V002REDFREESIZE', qty: 0 }])
  })
  it('refuses a file without the expected headers', () => {
    expect(() => parseTplStockRows([['a', 'b']])).toThrow('header_not_found')
  })
  it('refuses a non-integer or negative quantity', () => {
    expect(() => parseTplStockRows([head, ['', 'X', '', '', '', '', '', '', '', '', 'abc']])).toThrow('bad_qty:X')
    expect(() => parseTplStockRows([head, ['', 'X', '', '', '', '', '', '', '', '', -1]])).toThrow('bad_qty:X')
  })
})
