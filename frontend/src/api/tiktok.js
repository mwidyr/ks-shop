import client from './client'

export const getTikTokStructure = () => client.get('/tiktok/structure').then((r) => r.data)
export const listTikTokAccounts = (params) => client.get('/tiktok/accounts', { params }).then((r) => r.data)
export const getTikTokAccount = (id) => client.get(`/tiktok/accounts/${id}`).then((r) => r.data)
export const createTikTokAccount = (body) => client.post('/tiktok/accounts', body).then((r) => r.data)
export const updateTikTokAccount = (id, body) => client.put(`/tiktok/accounts/${id}`, body).then((r) => r.data)
export const addTikTokNote = (id, body) => client.post(`/tiktok/accounts/${id}/notes`, { body }).then((r) => r.data)
export const createTikTokDevice = (body) => client.post('/tiktok/devices', body).then((r) => r.data)
export const updateTikTokDevice = (id, body) => client.put(`/tiktok/devices/${id}`, body).then((r) => r.data)
export const deleteTikTokNote = (accountId, noteId) => client.delete(`/tiktok/accounts/${accountId}/notes/${noteId}`).then((r) => r.data)
