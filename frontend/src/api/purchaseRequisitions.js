import client from './client'

export function listPurchaseRequisitions() {
  return client.get('/purchase-requisitions').then((res) => res.data)
}

export function getPurchaseRequisition(id) {
  return client.get(`/purchase-requisitions/${id}`).then((res) => res.data)
}

export function createPurchaseRequisition() {
  return client.post('/purchase-requisitions', {}).then((res) => res.data)
}

export function deletePurchaseRequisition(id) {
  return client.delete(`/purchase-requisitions/${id}`).then((res) => res.data)
}

export function addRequisitionItem(requisitionId, payload) {
  return client.post(`/purchase-requisitions/${requisitionId}/items`, payload).then((res) => res.data)
}

export function removeRequisitionItem(itemId) {
  return client.delete(`/purchase-requisitions/items/${itemId}`).then((res) => res.data)
}

export function updateRequisitionSupplierGroup(groupId, payload) {
  return client.patch(`/purchase-requisitions/supplier-groups/${groupId}`, payload).then((res) => res.data)
}

export function submitPurchaseRequisition(id) {
  return client.post(`/purchase-requisitions/${id}/submit`).then((res) => res.data)
}
