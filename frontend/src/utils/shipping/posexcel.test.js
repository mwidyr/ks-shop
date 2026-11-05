import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { POS_HEADERS, buildPosRows, buildPosExcel } from './excel'

const rows = [
  { order_no: 'ORD-1', customer_name: 'Elly', customer_phone: '0975-043-651', shipping_address: '台中市西屯區朝馬二街39號4樓1', total_to_pay: 1150 },
  { order_no: 'ORD-2+ORD-3', customer_name: 'rina', customer_phone: '0919632084', shipping_address: null, total_to_pay: '480.00' },
]

describe('POS / 郵寄 Excel', () => {
  it('has the headers of the 便利帶 template', () => {
    expect(POS_HEADERS).toEqual(['收件人姓名', '收件人電話', '收件人郵遞區號', '收件人地址', '代收貨款', '備註', '備註二', '備註三'])
  })
  it('maps name, phone, blank, address, COD, internal order number', () => {
    const [a, b] = buildPosRows(rows)
    expect(a).toEqual(['Elly', '0975043651', null, '台中市西屯區朝馬二街39號4樓1', 1150, 'ORD-1', null, null])
    expect(b.slice(3, 6)).toEqual(['', 480, 'ORD-2+ORD-3'])
  })
  it('writes one sheet "Sheet 1" with the phone as text and the COD as a number', async () => {
    const wb = XLSX.read(await (await buildPosExcel(rows)).arrayBuffer())
    expect(wb.SheetNames).toEqual(['Sheet 1'])
    const ws = wb.Sheets['Sheet 1']
    expect(ws.B2).toMatchObject({ t: 's', v: '0975043651' })
    expect(ws.E2).toMatchObject({ t: 'n', v: 1150 })
    expect(ws.F3.v).toBe('ORD-2+ORD-3')
    expect(ws.C2).toBeUndefined()
  })
})
