import { describe, it, expect } from 'vitest'
import { WMS_STOCK_IN_HEADERS, stockInSheetData } from './requisitionExcel'

const detail = {
  suppliers: [
    { items: [{ sku: 'P021-WHITE-2XL' }, { sku: 'P021-BLACK-M' }] },
    { items: [{ sku: 'P021-WHITE-2XL' }, { sku: 'C010-WHITE-FREESIZE' }, { sku: '' }] },
  ],
}

describe('WMS stock-in export', () => {
  it('keeps the template header row: 14 columns, Chinese headers, A..N order', () => {
    expect(WMS_STOCK_IN_HEADERS).toHaveLength(14)
    expect(WMS_STOCK_IN_HEADERS[0]).toBe('入庫日期*')
    expect(WMS_STOCK_IN_HEADERS[3]).toBe('品號*')
    expect(WMS_STOCK_IN_HEADERS[4]).toBe('數量*')
    expect(WMS_STOCK_IN_HEADERS[5]).toBe('單位*')
    expect(WMS_STOCK_IN_HEADERS[13]).toBe('供應商')
  })

  it('one row per SKU: date blank, full SKU in D, 件 in the 單位 column, everything else empty', () => {
    const data = stockInSheetData(detail)
    expect(data.map((r) => r[3])).toEqual(['品號*', 'P021-WHITE-2XL', 'P021-BLACK-M', 'C010-WHITE-FREESIZE'])
    for (const row of data.slice(1)) {
      expect(row).toHaveLength(14)
      expect(row[0]).toBe('')
      expect(row[5]).toBe('件')
      expect(row.filter((v, i) => v !== '' && ![3, 5].includes(i))).toEqual([])
    }
  })

  it('an empty requisition exports just the header row', () => {
    expect(stockInSheetData({ suppliers: [] })).toEqual([WMS_STOCK_IN_HEADERS])
  })
})
