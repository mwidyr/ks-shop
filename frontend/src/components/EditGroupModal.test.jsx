// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) }) }))
vi.mock('../context/MasterDataContext', () => ({ useMasterData: () => ({ translateColor: (c) => c }) }))
vi.mock('../api/hosts', () => ({ listHosts: () => Promise.resolve([{ id: 1, name: 'Sepia' }]) }))
vi.mock('./ProductPickerModal', () => ({ default: ({ onAdd }) => <button data-testid="pick" onClick={() => onAdd([{ variantId: 9, qty: 2, price: 100, sku: 'S', productName: 'P', variantLabel: 'x' }])}>pick</button> }))
const update = vi.fn(() => Promise.resolve({}))
vi.mock('../api/orders', () => ({
  getMergeGroup: () => Promise.resolve({
    id: 5, chain_type: 'cvs_711', pickup_chain_name: '7-Eleven', customer_name: 'QQ', customer_phone: '0933', customer_email: '', pickup_store_name: 'A', pickup_store_code: '454211', shipping_address: '', shipping_fee: 60,
    members: [
      { id: 1, order_no: 'ORD-OLD', status: 'pending', created_at: '2026-10-31T10:00:00Z', locked: false, is_fee_holder: true, discount_amount: 0, additional_amount: 0 },
      { id: 2, order_no: 'ORD-NEW', status: 'pending', created_at: '2026-11-01T10:00:00Z', locked: false, is_fee_holder: false, discount_amount: 0, additional_amount: 0 },
    ],
    items: [
      { id: 11, order_id: 1, order_no: 'ORD-OLD', variant_id: 3, qty: 1, price: 250, host_id: 1, product_name: 'A', sku: 'a', color: 'r', size: 'M' },
      { id: 12, order_id: 2, order_no: 'ORD-NEW', variant_id: 4, qty: 1, price: 190, host_id: 1, product_name: 'B', sku: 'b', color: 'r', size: 'M' },
    ],
  }),
  updateMergeGroup: (...a) => update(...a),
}))

import EditGroupModal from './EditGroupModal'

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('EditGroupModal', () => {
  it('shows both original orders and adds a new item to the newer order by default', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    const onDone = vi.fn()
    await act(async () => { root.render(<EditGroupModal groupId={5} onClose={() => {}} onDone={onDone} />) })
    await flush()
    expect(el.textContent).toContain('ORD-OLD')
    expect(el.textContent).toContain('ORD-NEW')
    await act(async () => { el.querySelector('[data-testid="pick"]')?.click() })
    await act(async () => { [...el.querySelectorAll('button')].find((b) => b.textContent.includes('edit_add_item')).click() })
    await act(async () => { el.querySelector('[data-testid="pick"]').click() })
    await act(async () => { [...el.querySelectorAll('button')].find((b) => b.textContent === 'common.save').click() })
    await flush()
    const body = update.mock.calls[0][1]
    const added = body.items.find((i) => !i.id)
    expect(added.order_id).toBe(2)
    expect(body.items.filter((i) => i.id).map((i) => i.id)).toEqual([11, 12])
    expect(onDone).toHaveBeenCalled()
    root.unmount()
  })
})
