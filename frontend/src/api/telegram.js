import client from './client'

export const getTelegramSettings = () => client.get('/telegram/settings').then((r) => r.data)
export const saveTelegramSettings = (payload) => client.put('/telegram/settings', payload).then((r) => r.data)
export const checkTelegramConnection = (botToken) => client.post('/telegram/status', { bot_token: botToken || '' }).then((r) => r.data)
export const sendTelegramTestMessage = (payload) => client.post('/telegram/test-message', payload).then((r) => r.data)
export const sendTelegramTestNotification = (payload) => client.post('/telegram/test-notification', payload).then((r) => r.data)
