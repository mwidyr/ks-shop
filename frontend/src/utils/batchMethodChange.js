// Changing the shipping method of an order that sits in a shipping batch takes it out of the batch (it returns to
// Pending). Only for the roles that may use "Remove from batch", and only while the order does not exist on the
// 7-11 / FamilyMart platform yet. The server enforces this; this only decides what the forms offer.
export const BATCH_METHOD_ROLES = ['management', 'spv', 'warehouse', 'super_user']

export function canChangeMethodInBatch(role, order) {
  return Boolean(
    BATCH_METHOD_ROLES.includes(role) && order?.batch_no && !order.shipment_group_id
    && !order.platform_order_no && !order.tracking_number && order.batch_create_result !== 'created',
  )
}

// The server answers 409 + code when it needs the staff's confirmation before taking the order out of its batch.
export const isBatchRemovalPrompt = (err) => err?.response?.status === 409 && err.response.data?.code === 'confirm_batch_removal'
