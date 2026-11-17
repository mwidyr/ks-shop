import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { detectKind, detect711Exception, parse711Exception, parseFamilyMartUnclaimed, readImportFile } from './parsers'

// A 7-ELEVEN report as the platform exports it: sheet 1 is another store type, sheet 2 (訂單匯入) holds our orders;
// cell H1 of sheet 2 is the report category.
function report711(category, rows) {
  const head = ['賣場類型', '溫層', '訂購日期', '訂單編號', '狀態', '已取件日期時間', '收件人姓名', '配送單編號', '付款方式', '配送方式', '取件門市', '商品名稱', '單價', '優惠價', '數量', '小計', '運費', '商品總額', '配送數量', '買家下訂日期', '商品備註']
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['訂購日期：x'], [], ['賣場類型', '賣場名稱', '溫層', '訂購日期', '訂單編號']]), '其他')
  const row1 = ['訂購日期：x', '', '', '賣場類型：訂單匯入', '', '', '', category]
  const body = rows.map(([platform, status, order]) => ['訂單匯入', '常溫', '2026/11/11', platform, status, '', 'x*y', 'H1', '', '超商', '門市', '上衣', 1, 1, 1, 1, 0, 1, 1, '', order])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([row1, [], head, ...body]), '訂單匯入')
  return { XLSX, wb }
}

describe('7-ELEVEN exception reports', () => {
  it('cell H1 decides: 取消訂單 = expired labels, 未取退宅 = unclaimed returns', () => {
    expect(detect711Exception(report711('類別：取消訂單', [['CM1', '取消訂單', 'ORD-1']]))).toBe('711_expired')
    expect(detect711Exception(report711('類別：未取退宅', [['CM1', '逾期未取件', 'ORD-1']]))).toBe('711_unclaimed')
    expect(detectKind(report711('類別：取消訂單', [['CM1', '取消訂單', 'ORD-1']]))).toBe('711_expired')
  })
  it('any other H1 is not an exception report (the normal export keeps working)', () => {
    expect(detect711Exception(report711('類別：全部', [['CM1', '已寄件', 'ORD-1']]))).toBeNull()
    expect(detectKind(report711('類別：全部', [['CM1', '已寄件', 'ORD-1']]))).toBe('711_export')
  })
  it('expired labels: every row becomes a record with both numbers (an empty one is reported by the server)', () => {
    const { records, ignored } = parse711Exception(report711('類別：取消訂單', [['CM1', '取消訂單', 'ORD-1'], ['CM2', '取消訂單', '']]), '711_expired')
    expect(ignored).toBe(0)
    expect(records).toEqual([
      { row: 4, order_no: 'ORD-1', platform_order_no: 'CM1' },
      { row: 5, order_no: '', platform_order_no: 'CM2' },
    ])
  })
  it('unclaimed returns: only 逾期未取件 rows; picked-up, shipped and delivered rows are ignored', () => {
    const { records, ignored } = parse711Exception(
      report711('類別：未取退宅', [['CM1', '逾期未取件', 'ORD-1'], ['CM2', '已取件\n(11/16 20:16)\n', 'ORD-2'], ['CM3', '已送達', 'ORD-3'], ['CM4', '已寄件', 'ORD-4']]),
      '711_unclaimed')
    expect(records.map((r) => r.order_no)).toEqual(['ORD-1'])
    expect(ignored).toBe(3)
  })
  it('the upload area refuses a file with another H1 and processes nothing', async () => {
    const buf = XLSX.write(report711('類別：全部', [['CM1', '已寄件', 'ORD-1']]).wb, { type: 'array', bookType: 'xlsx' })
    const file = new File([buf], 'x.xlsx')
    await expect(readImportFile(file, '711_exception')).rejects.toThrow('wrong_category')
  })
})

describe('FamilyMart unclaimed returns', () => {
  it('only 訂單狀態 = 退回; our order number is in 商品名稱, the platform number in 訂單編號', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['訂單編號', '商品名稱', '寄件編號', '訂單狀態'],
      ['L1', 'ORD-1', '163', '退回'],
      ['L2', 'ORD-2', '164', '已取貨'],
    ]), 'Sheet1')
    const { records, ignored } = parseFamilyMartUnclaimed({ XLSX, wb })
    expect(records).toEqual([{ row: 2, order_no: 'ORD-1', platform_order_no: 'L1' }])
    expect(ignored).toBe(1)
  })
})
