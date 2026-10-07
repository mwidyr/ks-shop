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

export function updatePurchaseRequisition(id, payload) {
  return client.patch(`/purchase-requisitions/${id}`, payload).then((res) => res.data)
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

export function submitForConfirmation(id) {
  return client.post(`/purchase-requisitions/${id}/submit-for-confirmation`).then((res) => res.data)
}

export function confirmOrder(id) {
  return client.post(`/purchase-requisitions/${id}/confirm-order`).then((res) => res.data)
}

// Supplier-group notes log: added one by one, editable in every requisition status.
export function addRequisitionNote(groupId, note) {
  return client.post(`/purchase-requisitions/supplier-groups/${groupId}/notes`, { note }).then((res) => res.data)
}

export function updateRequisitionNote(noteId, note) {
  return client.patch(`/purchase-requisitions/notes/${noteId}`, { note }).then((res) => res.data)
}

export function deleteRequisitionNote(noteId) {
  return client.delete(`/purchase-requisitions/notes/${noteId}`).then((res) => res.data)
}
