import { describe, it, expect } from 'vitest'
import { WMS_STOCK_IN_HEADERS, stockInSheetData } from './requisitionExcel'

const detail = {
  requisition_no: 'REQ-00008',
  created_at: '2026-11-11T00:00:00',
  suppliers: [
    { items: [{ sku: 'P021-WHITE-2XL', planned_qty: 5 }, { sku: 'P021-BLACK-M', planned_qty: 3 }] },
    { items: [{ sku: 'P021-WHITE-2XL', planned_qty: 2 }, { sku: 'C010-WHITE-FREESIZE', planned_qty: 10 }, { sku: '' }] },
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

  it('one row per SKU: creation date-time in A, requisition number in B, full SKU in D, Planned QTY in E (summed across suppliers), 件 in the 單位 column, everything else empty', () => {
    const data = stockInSheetData(detail)
    expect(data.map((r) => r[3])).toEqual(['品號*', 'P021WHITE2XL', 'P021BLACKM', 'C010WHITEFREESIZE'])
    expect(data.slice(1).map((r) => r[4])).toEqual([7, 3, 10])
    for (const row of data.slice(1)) {
      expect(row).toHaveLength(14)
      expect(row[0]).toEqual(new Date('2026-11-11T00:00:00'))
      expect(row[1]).toBe('REQ-00008')
      expect(row[5]).toBe('件')
      expect(row.filter((v, i) => v !== '' && ![0, 1, 3, 4, 5].includes(i))).toEqual([])
    }
  })

  it('leaves the date empty when the requisition has no valid created_at', () => {
    expect(stockInSheetData({ requisition_no: 'REQ-1', suppliers: [{ items: [{ sku: 'A-B', planned_qty: 1 }] }] })[1].slice(0, 2)).toEqual(['', 'REQ-1'])
  })

  it('an empty requisition exports just the header row', () => {
    expect(stockInSheetData({ suppliers: [] })).toEqual([WMS_STOCK_IN_HEADERS])
  })
})
