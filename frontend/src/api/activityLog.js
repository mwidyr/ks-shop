import client from './client'

export function listActivityLog(page = 1) {
  return client.get(`/activity-log?page=${page}&page_size=50`).then((res) => res.data)
}
