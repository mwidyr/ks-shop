import client from './client'

export function getFeeSettings() {
  return client.get('/settings/fees').then((res) => res.data)
}

export function updateFeeSettings(payload) {
  return client.patch('/settings/fees', payload).then((res) => res.data)
}
