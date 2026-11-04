import { describe, it, expect } from 'vitest'
import { THREEPL_HEADERS, buildThreePLRows } from './excel'

const row = {
  order_no: 'ORD-1', platform_order_no: 'CM2610300619206', group_order_nos: ['ORD-2'], order_date: '2026/10/30', customer_name: 'Yati', customer_phone: '0911-172-477',
  chain_type: 'cvs_711', is_home_delivery: false, pickup_store_name: '安博', pickup_store_code: '195896', total_to_pay: 540,
  internal_notes_combined: '', tracking_number: null,
  lines: [{ sku: 'C025-HITAM-FREESIZE', name: 'Atasan', qty: 1, price: 250 }, { sku: 'C002-PINK-FREESIZE', name: 'Kaos', qty: 2, price: 145 }],
}

describe('3PL export', () => {
  it('has the 34 columns of the 3PL template', () => {
    expect(THREEPL_HEADERS).toHaveLength(34)
    expect(THREEPL_HEADERS[0]).toBe('訂單編號*')
    expect(THREEPL_HEADERS[33]).toBe('街道地址')
  })
  it('writes one row per product line with ONE order number for a merged shipment', () => {
    const rows = buildThreePLRows([row])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.length === 34 && r[0] === 'ORD-1' && r[19] === 'ORD-1')).toBe(true)
    expect([rows[0][9], rows[0][14]]).toEqual(['', ''])
    expect(rows[0][5]).toBe('0911172477')
    expect(rows[0][4]).toBe('195896')
    expect(rows[0][7]).toBe('')
    expect(rows[1].slice(11, 14)).toEqual(['C002-PINK-FREESIZE', 'Kaos', 2])
  })
  it('A = shipping number, V = platform order number, G = fixed logistics type per provider', () => {
    const f = (o) => buildThreePLRows([o])[0]
    const seven = f({ ...row, tracking_number: 'H21867786009' })
    expect([seven[0], seven[21], seven[6], seven[19]]).toEqual(['H21867786009', 'CM2610300619206', 'seven-c2c', 'ORD-1'])
    const fam = f({ ...row, chain_type: 'cvs_familymart', platform_order_no: 'L26B03029Z', tracking_number: '16353655993' })
    expect([fam[0], fam[21], fam[6]]).toEqual(['16353655993', 'L26B03029Z', 'family-c2c'])
    const pos = f({ ...row, chain_type: 'courier', platform_order_no: null })
    expect([pos[0], pos[6], pos[21]]).toEqual(['ORD-1', 'Maple', ''])
  })
})
