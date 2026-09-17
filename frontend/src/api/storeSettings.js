import client from './client'

export function getStoreSettings() {
  return client.get('/store-settings').then((res) => res.data)
}

export function updateStoreSettings(shopName) {
  return client.patch('/store-settings', { shop_name: shopName }).then((res) => res.data)
}
