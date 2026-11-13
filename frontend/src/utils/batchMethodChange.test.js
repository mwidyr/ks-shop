import { describe, expect, it } from 'vitest'
import { canChangeMethodInBatch, isBatchRemovalPrompt } from './batchMethodChange'

const failed = { batch_no: 'B711-1', batch_create_result: 'failed', platform_order_no: '', tracking_number: '' }

describe('shipping method change for an order in a batch', () => {
  it('is offered to the authorized roles while the order is not on the platform yet', () => {
    for (const role of ['management', 'spv', 'warehouse', 'super_user']) expect(canChangeMethodInBatch(role, failed)).toBe(true)
    expect(canChangeMethodInBatch('sales', failed)).toBe(false)
    expect(canChangeMethodInBatch(undefined, failed)).toBe(false)
  })
  it('is not offered once the order exists on the platform', () => {
    expect(canChangeMethodInBatch('management', { ...failed, batch_create_result: 'created' })).toBe(false)
    expect(canChangeMethodInBatch('management', { ...failed, platform_order_no: 'CM1' })).toBe(false)
    expect(canChangeMethodInBatch('management', { ...failed, tracking_number: 'G1' })).toBe(false)
  })
  it('is not offered outside a batch or for a merged shipment', () => {
    expect(canChangeMethodInBatch('management', { ...failed, batch_no: '' })).toBe(false)
    expect(canChangeMethodInBatch('management', { ...failed, shipment_group_id: 3 })).toBe(false)
  })
  it('recognises the confirmation request of the server', () => {
    expect(isBatchRemovalPrompt({ response: { status: 409, data: { code: 'confirm_batch_removal' } } })).toBe(true)
    expect(isBatchRemovalPrompt({ response: { status: 409, data: { error: 'x' } } })).toBe(false)
    expect(isBatchRemovalPrompt(new Error('x'))).toBe(false)
  })
})
