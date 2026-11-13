import { describe, expect, it } from 'vitest'
import { configFromPromotion, configToPayload, emptyConfig, splitList } from './PromotionRules'

describe('promotion rules form', () => {
  it('splits typed colours and SKUs on commas and new lines', () => {
    expect(splitList('Black, White，Red\n C1 ')).toEqual(['Black', 'White', 'Red', 'C1'])
    expect(splitList('')).toEqual([])
  })
  it('builds the combo payload the server expects', () => {
    const c = { ...emptyConfig('combo'), pool: { product_ids: [3], colors: 'Black, White', skus: '' }, required_qty: '2', combo_price: '500', distinct: true }
    expect(configToPayload('combo', c)).toEqual({ pool: { product_ids: [3], colors: ['Black', 'White'], skus: [] }, required_qty: 2, combo_price: 500, max_sets: 0, distinct: true })
  })
  it('round-trips an add-on and a buy-a-get-b rule', () => {
    const addon = { trigger: { product_ids: [1], colors: [], skus: ['A-1'] }, trigger_qty: 1, addon: { product_ids: [2], colors: ['Red'], skus: [] }, addon_price: 100, max_qty: 2 }
    expect(configToPayload('addon', configFromPromotion('addon', addon))).toEqual({ ...addon, trigger_qty: 1 })
    const bg = { trigger: { product_ids: [1], colors: [], skus: [] }, trigger_qty: 2, gifts: [{ variant_id: 7 }, { variant_id: 8 }], gift_qty: 1, max_sets: 0 }
    expect(configToPayload('buy_a_get_b', configFromPromotion('buy_a_get_b', bg))).toEqual(bg)
  })
  it('an empty form has empty rules per type and none for coupons', () => {
    expect(emptyConfig('fixed_amount')).toEqual({})
    expect(emptyConfig('addon').addon.product_ids).toEqual([])
  })
})
