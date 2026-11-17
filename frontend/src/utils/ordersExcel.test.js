import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { orderSheetData, buildOrdersWorkbookBlob, ORDER_COLUMNS, shortageSheetData, buildShortageWorkbookBlob } from './ordersExcel'

const t = (k, d) => (typeof d === 'string' ? d : k)
const order = (o) => ({ id: 1, order_no: 'ORD-1', status: 'shipped', created_at: '2026-11-17T03:04:05Z', customer_name: 'Ana', customer_phone: '0912345678', pickup_chain_name: '7-ELEVEN', pickup_chain_type: 'cvs_711', pickup_store_name: 'Store A', pickup_store_code: '012345', shipping_address: 'x', total_qty: 3, total: 650, source: 'staff', is_urgent: true, customer_blacklisted: false, is_merged: false, items: [{ sku: 'P021-WHITE-2XL', name: 'Celana', qty: 2 }, { sku: 'P022-BLK-M', name: '', qty: 1 }], ...o })

describe('orders Excel', () => {
  it('has one header per column and one row per order, phone and store code as text', () => {
    const data = orderSheetData([order(), order({ id: 2, order_no: 'ORD-2', pickup_chain_type: 'home_delivery', pickup_store_code: '', shipping_address: 'Jl. A 1' })], t)
    expect(data).toHaveLength(3)
    expect(data[0]).toHaveLength(ORDER_COLUMNS.length)
    expect(data[1][0]).toBe('ORD-1')
    expect(data[1][4]).toBe('0912345678')
    expect(data[1][7]).toBe('012345')
    expect(data[1][8]).toBe('') // a store order has no home address
    expect(data[2][8]).toBe('Jl. A 1')
    expect(data[1][9]).toBe(3)
    expect(data[1][10]).toBe(650)
    expect(data[1][12]).toBe('P021-WHITE-2XL ×2 Celana; P022-BLK-M ×1') // the products of the order
    expect(data[2][12]).toBe('P021-WHITE-2XL ×2 Celana; P022-BLK-M ×1')
  })

  it('writes a real xlsx with the rows', async () => {
    const blob = await buildOrdersWorkbookBlob([order()], t)
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Orders, { header: 1, raw: false })
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('ORD-1')
    expect(rows[1][4]).toBe('0912345678')
  })
})

describe('listAllOrders', () => {
  it('fetches every page, drops duplicates and reports truncation', async () => {
    vi.resetModules()
    const calls = []
    vi.doMock('../api/client', () => ({ default: { get: vi.fn((url) => {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page'))
      calls.push(page)
      const items = Array.from({ length: page === 3 ? 50 : 100 }, (_, i) => ({ id: (page - 1) * 100 + i + 1 }))
      if (page === 2) items[0] = { id: 100 } // shifted by a new order: duplicate of the previous page
      return Promise.resolve({ data: { items, total: 250 } })
    }) } }))
    const { listAllOrders } = await import('../api/orders')
    const all = await listAllOrders({ status: 'shipped' })
    expect(calls.sort()).toEqual([1, 2, 3])
    expect(all.items).toHaveLength(249)
    expect(all.truncated).toBe(false)
    const capped = await listAllOrders({}, 120)
    expect(capped.items).toHaveLength(120)
    expect(capped.truncated).toBe(true)
  })
})

describe('shortage Excel', () => {
  const lines = [
    { created_at: '2026-11-15 10:30', order_no: 'ORD-1', delivery: '7-ELEVEN', sku: 'P021-WHITE-2XL', ordered: 3, available: 0, short: 3 },
    { created_at: '2026-11-16 09:00', order_no: 'ORD-2, ORD-3', delivery: 'HCT', sku: 'P022-BLK-M', ordered: 2, available: 1, short: 1 },
  ]
  it('has the date, order number, SKU and the quantity short', () => {
    const data = shortageSheetData(lines, t)
    expect(data).toHaveLength(3)
    expect(data[1]).toEqual(['2026-11-15 10:30', 'ORD-1', '7-ELEVEN', 'P021-WHITE-2XL', 3, 0, 3])
    expect(data[2][1]).toBe('ORD-2, ORD-3')
  })
  it('writes a real xlsx', async () => {
    const wb = XLSX.read(await (await buildShortageWorkbookBlob(lines, t)).arrayBuffer(), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Insufficient stock'], { header: 1 })
    expect(rows).toHaveLength(3)
    expect(rows[2][3]).toBe('P022-BLK-M')
    expect(rows[2][6]).toBe(1)
  })
})
