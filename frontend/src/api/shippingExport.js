import client from './client'

export function listShippingExport(includeExported) {
  const q = includeExported ? '?include_exported=true' : ''
  return client.get(`/shipping-export${q}`).then((res) => res.data)
}

export function markExported(orderIds) {
  return client.post('/shipping-export/mark-exported', { order_ids: orderIds }).then((res) => res.data)
}

export function updateTrackingNumber(orderId, trackingNumber) {
  return client.patch(`/orders/${orderId}/tracking-number`, { tracking_number: trackingNumber }).then((res) => res.data)
}
