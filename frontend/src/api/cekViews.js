import client from './client'

export const getPortalOverview = () => client.get('/cek-views/portal/overview').then((r) => r.data)
export const getPortalHosts = (locationId, shift) => client.get('/cek-views/portal/hosts', { params: { location_id: locationId, shift } }).then((r) => r.data)
export const submitViews = (body) => client.post('/cek-views/submit', body).then((r) => r.data)

export const getAssignments = (locationId) => client.get('/cek-views/assignments', { params: { location_id: locationId } }).then((r) => r.data)
export const saveAssignments = (items) => client.put('/cek-views/assignments', { items }).then((r) => r.data)

export const getVoiceSettings = () => client.get('/cek-views/voice').then((r) => r.data)
export const saveVoiceSettings = (body) => client.put('/cek-views/voice', body).then((r) => r.data)
export const uploadVoiceFile = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/cek-views/voice/file', form).then((r) => r.data)
}
export const fetchVoiceBlob = () => client.get('/cek-views/voice/file', { responseType: 'blob' }).then((r) => r.data)
export const testVoice = () => client.post('/cek-views/voice/test').then((r) => r.data)

export const getCekTelegram = () => client.get('/cek-views/telegram').then((r) => r.data)
export const saveCekTelegram = (body) => client.put('/cek-views/telegram', body).then((r) => r.data)
export const checkCekTelegram = (botToken) => client.post('/cek-views/telegram/status', { bot_token: botToken || '' }).then((r) => r.data)
export const testCekTelegram = () => client.post('/cek-views/telegram/test').then((r) => r.data)
