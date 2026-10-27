import { describe, it, expect } from 'vitest'
import { WMS_HEADERS, wmsSheetData } from './productExcel'

const products = [
  { name: 'Celana Pendek Jas', names: { zh: '西裝短褲', en: 'Tailored Shorts' }, variants: [{ sku: 'P021-KHAKI-XL' }, { sku: 'P021-BLACK-M' }] },
  { name: '只有中文名', names: {}, variants: [{ sku: 'P022-WHITE-FREESIZE' }] },
  { name: 'No variants', names: { zh: '無' }, variants: [] },
]

describe('WMS product export', () => {
  it('keeps the template header row: 33 columns, Chinese headers, A..AG order', () => {
    expect(WMS_HEADERS).toHaveLength(33)
    expect(WMS_HEADERS[0]).toBe('商品名稱 *')
    expect(WMS_HEADERS[2]).toBe('品號 *')
    expect(WMS_HEADERS[6]).toBe('單位規格 *')
    expect(WMS_HEADERS[32]).toBe('序號數量')
  })

  it('one row per variant, only A, C and G filled, every other column present and empty', () => {
    const data = wmsSheetData(products)
    expect(data).toHaveLength(1 + 3)
    expect(data[1]).toHaveLength(33)
    expect(data[1][0]).toBe('西裝短褲')
    expect(data[1][2]).toBe('P021-KHAKI-XL')
    expect(data[1][6]).toBe('1件')
    expect(data[2][2]).toBe('P021-BLACK-M')
    expect(data[1].filter((v, i) => v !== '' && ![0, 2, 6].includes(i))).toEqual([])
  })

  it('falls back to the product name when there is no Chinese name', () => {
    expect(wmsSheetData(products)[3][0]).toBe('只有中文名')
  })
})
