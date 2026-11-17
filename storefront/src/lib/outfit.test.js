import { describe, it, expect } from 'vitest'
import { outfitCartLines } from './outfit'

const item = (id, stock) => ({ variant_id: id, product_id: id * 10, name: `P${id}`, color: 'Hitam', size: 'Freesize', price: 190, stock, image: '', sku: `S${id}`, live_code: `L${id}` })

describe('outfitCartLines', () => {
  it('adds every item when all are in stock', () => {
    const r = outfitCartLines([item(1, 3), item(2, 1)])
    expect(r.toast).toBe('added')
    expect(r.lines.map((l) => l.variantId)).toEqual([1, 2])
    expect(r.lines[0]).toMatchObject({ productId: 10, stock: 3, code: 'S1', liveCode: 'L1' })
  })
  it('skips sold-out items and reports it', () => {
    const r = outfitCartLines([item(1, 3), item(2, 0), item(3, 2)])
    expect(r.toast).toBe('partial')
    expect([r.added, r.total]).toEqual([2, 3])
    expect(r.lines.map((l) => l.variantId)).toEqual([1, 3])
  })
  it('says so when nothing can be added', () => {
    expect(outfitCartLines([item(1, 0)]).toast).toBe('none')
    expect(outfitCartLines([]).lines).toEqual([])
  })
})
