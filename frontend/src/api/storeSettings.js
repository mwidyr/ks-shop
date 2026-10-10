import client from './client'

export function getStoreSettings() {
  return client.get('/store-settings').then((res) => res.data)
}

export function updateStoreSettings(shopName) {
  return client.patch('/store-settings', { shop_name: shopName }).then((res) => res.data)
}

export function getWebsiteLaunch() {
  return client.get('/store-settings/website-launch').then((res) => res.data)
}

export function updateWebsiteLaunch(date) {
  return client.patch('/store-settings/website-launch', { website_launch_date: date }).then((res) => res.data)
}
